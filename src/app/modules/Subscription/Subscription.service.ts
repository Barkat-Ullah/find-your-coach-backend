import httpStatus from 'http-status';
import { Request } from 'express';
import { prisma } from '../../utils/prisma';
import { PaymentStatus, SubscriptionType } from '@prisma/client';
import AppError from '../../errors/AppError';
import { stripe } from '../../utils/stripe';
import Stripe from 'stripe';

// Create Subscription
const createIntoDb = async (req: Request) => {
  const { title, price, duration, feature, adminId } = req.body;

  if (!title || !price || !duration) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing required fields');
  }

  let stripeProductId: string | null = null;
  let stripePriceId: string | null = null;

  // Create product on Stripe
  const product = await stripe.products.create({
    name: title,
    description: `Subscription plan - ${duration}`,
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


const assignSubscriptionToCoach = async (coachId: string, payload: any) => {
  const { subscriptionId, methodId } = payload;

  const coach = await prisma.coach.findUnique({
    where: { id: coachId },
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

  let customerId = coach.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: coach.email,
      name: coach.fullName,
      metadata: { coachId: coach.id },
    });
    customerId = customer.id;
    await prisma.coach.update({
      where: { id: coachId },
      data: { stripeCustomerId: customerId },
    });
  }

  await stripe.paymentMethods.attach(methodId, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: methodId },
  });

  const stripeSubscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: subscription.stripePriceId }],
    expand: ['latest_invoice.payment_intent'],
  });

  const latestInvoice = stripeSubscription.latest_invoice as Stripe.Invoice;
const paymentIntent = (latestInvoice as any)
  .payment_intent as Stripe.PaymentIntent | null;

  if (!paymentIntent) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Payment intent not found.',
    );
  }

  const startDate = new Date();
  const endDate = new Date();
  if (subscription.duration === 'MONTHLY')
    endDate.setMonth(startDate.getMonth() + 1);
  if (subscription.duration === 'YEARLY')
    endDate.setFullYear(startDate.getFullYear() + 1);

  await prisma.coach.update({
    where: { id: coachId },
    data: {
      subscriptionId: subscription.id,
      subscriptionStart: startDate,
      subscriptionEnd: endDate,
    },
  });

  await prisma.payment.create({
    data: {
      coachId,
      subscriptionId: subscription.id,
      amount: subscription.price,
      currency: 'usd',
      status: PaymentStatus.PENDING,
      stripePaymentId: paymentIntent.id,
      stripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId: customerId,
    },
  });

  return {
    message: 'Subscription purchased successfully',
    stripeSubscriptionId: stripeSubscription.id,
  };
};


//............................//

// Get Subscription by ID

const getCoachSubscription = async (coachId: string) => {
  const coach = await prisma.coach.findUnique({
    where: { id: coachId },
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
  const subscription = await prisma.subscription.update({
    where: { id },
    data: {
      ...(data.title && { title: data.title }),
      ...(data.price && { price: parseFloat(data.price) }),
      ...(data.subscriptionType && {
        subscriptionType: data.subscriptionType,
      }),
      ...(data.duration && { duration: data.duration }),
    },
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

const deleteMySubscription = async (coachId: string) => {
  const coach = await prisma.coach.findUnique({ where: { id: coachId } });
  if (!coach) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!coach.subscriptionId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You do not have an active subscription to delete',
    );
  }

  const updatedUser = await prisma.coach.update({
    where: { id: coachId },
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
