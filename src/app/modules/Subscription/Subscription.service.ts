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
    const paymentIntent = latestInvoice?.payment_intent as Stripe.PaymentIntent ;

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
        stripePaymentId: paymentIntent?.id ,
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
    include: { subscription: true },
  });

  if (!coach || !coach.subscription) return null;

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
  });

  return subscription;
};

// Update Subscription
const updateIntoDb = async (id: string, data: Partial<any>) => {
  // normalize price
  const price =
    data.price !== undefined && data.price !== null
      ? typeof data.price === 'string'
        ? parseFloat(data.price)
        : Number(data.price)
      : undefined;

  // normalize feature using toStringArray
  const featureArray =
    data.feature !== undefined ? toStringArray(data.feature) : undefined;

  const updateData: any = {
    ...(data.title && { title: data.title }),
    ...(price !== undefined && !Number.isNaN(price) && { price }),
    ...(data.subscriptionType && { subscriptionType: data.subscriptionType }),
    ...(data.duration && { duration: data.duration }),
  };

  // Mongo variant: use set (replace) or push (append)
  if (featureArray !== undefined) {
    if (data.appendFeature) {
      updateData.feature = { push: featureArray };
    } else {
      updateData.feature = { set: featureArray };
    }
  }

  const subscription = await prisma.subscription.update({
    where: { id },
    data: updateData,
  });

  return subscription;
};

// Hard Delete Subscription
const deleteIntoDb = async (id: string) => {
  const subscription = await prisma.subscription.update({
    where: { id },
    data: { isActive: false },
  });

  return subscription;
};

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
