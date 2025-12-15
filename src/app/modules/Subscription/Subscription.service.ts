import httpStatus from 'http-status';
import { Request } from 'express';
import { prisma } from '../../utils/prisma';
import { PaymentStatus, SubscriptionType } from '@prisma/client';
import AppError from '../../errors/AppError';
import { stripe } from '../../utils/stripe';
import Stripe from 'stripe';
import { toStringArray } from '../Auth/Auth.constants';

// Create Subscription
const createIntoDb = async (req: Request) => {
  const adminId = req.user?.id;
  const { title, price, duration, feature } = req.body;

  if (!title || !price || !duration) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing required fields');
  }

  // let stripeProductId: string | null = null;
  // let stripePriceId: string | null = null;

  // Create product on Stripe
  const product = await stripe.products.create({
    name: title,
    description: `Subscription plan - ${duration}`,
    active: true,
  });

  const stripePrice = await stripe.prices.create({
    product: product.id,
    unit_amount: Math.round(price * 100),
    currency: 'usd',
    recurring: {
      interval: duration === 'MONTHLY' ? 'month' : 'year',
    },
  });

  const subscription = await prisma.subscription.create({
    data: {
      title,
      price: parseFloat(price),
      duration,
      feature,
      stripePriceId: stripePrice.id,
      stripeProductId: product.id,
      adminId,
    },
  });

  return subscription;
};

// Get All Subscription (Optional Filtering)
const getAllSubscription = async () => {
  const subscriptions = await prisma.subscription.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      price: true,
      duration: true,
      feature: true,
      stripePriceId: true,
      isActive: true,
    },
  });

  return subscriptions;
};

const assignSubscriptionToCoach = async (coachMail: string, payload: any) => {
  const { subscriptionId, methodId } = payload;

  const coach = await prisma.coach.findUnique({
    where: { email: coachMail },
    include: { subscription: true },
  });
  if (!coach) throw new AppError(httpStatus.NOT_FOUND, 'Coach not found');

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!subscription)
    throw new AppError(httpStatus.NOT_FOUND, 'Subscription not found');

  if (coach.subscriptionEnd && coach.subscriptionEnd > new Date()) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Coach already has an active subscription',
    );
  }

  if (!subscription.stripePriceId) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Stripe Price ID missing.',
    );
  }

  try {
    // 1️⃣ Ensure Stripe Customer Exists
    let customerId = coach.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: coach.email,
        name: coach.fullName,
        metadata: { coachId: coach.id },
      });
      customerId = customer.id;
      await prisma.coach.update({
        where: { email: coachMail },
        data: { stripeCustomerId: customerId },
      });
    }

    // 2️⃣ Attach Payment Method
    await stripe.paymentMethods.attach(methodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: methodId },
    });

    // 3️⃣ Create Subscription
    const stripeSubscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: subscription.stripePriceId }],
      expand: ['latest_invoice.payment_intent'],
    });

    console.log('✅ Stripe Subscription:', stripeSubscription.id);

    const latestInvoice = stripeSubscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = latestInvoice?.payment_intent as Stripe.PaymentIntent;

    // 4️⃣ Store Payment Record (initially pending)
    const paymentRecord = await prisma.payment.create({
      data: {
        coachId: coach.id,
        subscriptionId: subscription.id,
        amount: subscription.price,
        currency: 'usd',
        status: PaymentStatus.PENDING,
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: customerId,
        stripePaymentId: paymentIntent?.id,
      },
    });

    // 5️⃣ Save Subscription Dates (provisional)
    const startDate = new Date();
    const endDate = new Date();
    if (subscription.duration === 'MONTHLY')
      endDate.setMonth(startDate.getMonth() + 1);
    if (subscription.duration === 'YEARLY')
      endDate.setFullYear(startDate.getFullYear() + 1);

    await prisma.coach.update({
      where: { email: coachMail },
      data: {
        subscriptionId: subscription.id,
        subscriptionStart: startDate,
        subscriptionEnd: endDate,
      },
    });

    return {
      message: 'Subscription initiated successfully',
      stripeSubscriptionId: stripeSubscription.id,
      clientSecret: paymentIntent?.client_secret || null,
      paymentId: paymentRecord.id,
    };
  } catch (error) {
    console.log('❌ Stripe Subscription Error:', error);
    throw error;
  }
};

//............................//

// Get Subscription by ID

const getCoachSubscription = async (coachMail: string) => {
  const coach = await prisma.coach.findUnique({
    where: { email: coachMail },
    include: { subscription: true, payment: true },
  });

  if (!coach || !coach.subscription) return null;

  if (!PaymentStatus.SUCCESS) {
    throw new AppError(httpStatus.NOT_FOUND, 'Payment not success');
  }

  const now = new Date();
  const remainingDays = coach.subscriptionEnd
    ? Math.max(
        Math.ceil(
          (coach.subscriptionEnd.getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        ),
        0,
      )
    : 0;

  if (remainingDays === 0) {
    await prisma.coach.update({
      where: { email: coachMail },
      data: {
        subscriptionId: null,
        subscriptionStart: null,
        subscriptionEnd: null,
      },
    });

    return {
      message: 'Subscription expired. Data reset successfully.',
    };
  }
  return {
    id: coach.subscription.id,
    title: coach.subscription.title,
    duration: coach.subscription.duration,
    feature: coach.subscription.feature,
    startDate: coach.subscriptionStart,
    endDate: coach.subscriptionEnd,
    remainingDays,
  };
};

const getSubscriptionByIdFromDB = async (id: string) => {
  const subscription = await prisma.subscription.findUnique({
    where: { id },
    omit: {
      createdAt: true,
      updatedAt: true,
      adminId: true,
    },
  });

  return subscription;
};

// Update Subscription
const updateIntoDb = async (id: string, data: Partial<any>) => {
  const subscription = await prisma.subscription.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      price: true,
      duration: true,
      stripePriceId: true,
      stripeProductId: true,
    },
  });

  if (!subscription) {
    throw new AppError(httpStatus.NOT_FOUND, 'Subscription not found');
  }

  // Must have stripe product id
  if (!subscription.stripeProductId) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Missing Stripe Product ID. Cannot update paid subscription.',
    );
  }

  const stripeProductId = subscription.stripeProductId;

  // Normalize price
  const price =
    data.price !== undefined && data.price !== null
      ? typeof data.price === 'string'
        ? parseFloat(data.price)
        : Number(data.price)
      : undefined;

  const updateData: any = {};

  // -----------------------------
  // 1️⃣ UPDATE STRIPE PRODUCT
  // -----------------------------
  const needToUpdateProduct = data.title || data.duration || data.description;

  if (needToUpdateProduct) {
    await stripe.products.update(stripeProductId, {
      name: data.title || subscription.title,
      description: `${data.duration || subscription.duration} subscription plan`,
    });

    if (data.title) updateData.title = data.title;
    if (data.duration) updateData.duration = data.duration;
  }

  // 2️⃣ UPDATE STRIPE PRICE
  let stripePriceId = subscription.stripePriceId;

  if (price !== undefined && price !== subscription.price) {
    if (subscription.stripePriceId) {
      await stripe.prices.update(subscription.stripePriceId, {
        active: false,
      });
    }

    const newPrice = await stripe.prices.create({
      unit_amount: Math.round(price * 100),
      currency: 'usd',
      recurring: {
        interval: subscription.duration === 'YEARLY' ? 'year' : 'month',
      },
      product: stripeProductId,
    });

    stripePriceId = newPrice.id;
    updateData.stripePriceId = newPrice.id;
    updateData.price = price;
  }

  // -----------------------------
  // 3️⃣ UPDATE MONGO FEATURES

  if (data.feature !== undefined) {
    const featureArray = toStringArray(data.feature);
    updateData.feature = featureArray;
  }

  // -----------------------------
  // 4️⃣ FINAL DATABASE UPDATE

  const result = await prisma.subscription.update({
    where: { id },
    data: updateData,
  });

  return result;
};

//
const toggleSubscription = async (id: string) => {
  // First, fetch the current subscription to check its state
  const currentSubscription = await prisma.subscription.findUnique({
    where: { id },
  });

  if (!currentSubscription) {
    throw new Error('Subscription not found');
  }

  // Toggle the isActive field
  const subscription = await prisma.subscription.update({
    where: { id },
    data: { isActive: !currentSubscription.isActive },
  });

  return subscription;
};
const deleteIntoDb = toggleSubscription;

const deleteMySubscription = async (coachMail: string) => {
  const coach = await prisma.coach.findUnique({ where: { email: coachMail } });
  if (!coach) {
    throw new AppError(httpStatus.NOT_FOUND, 'coach not found');
  }

  if (!coach.subscriptionId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You do not have an active subscription to delete',
    );
  }

  const updatedUser = await prisma.coach.update({
    where: { email: coachMail },
    data: {
      subscriptionId: null,
      subscriptionStart: null,
      subscriptionEnd: null,
    },
  });

  return updatedUser;
};

export const SubscriptionServices = {
  createIntoDb,
  assignSubscriptionToCoach,
  getAllSubscription,
  getSubscriptionByIdFromDB,
  updateIntoDb,
  deleteIntoDb,
  getCoachSubscription,
  deleteMySubscription,
};
