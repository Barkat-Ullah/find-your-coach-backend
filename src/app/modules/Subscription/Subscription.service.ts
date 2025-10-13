import httpStatus from 'http-status';
import { prisma } from '../../utils/prisma';
import AppError from '../../errors/AppError';
import { SubscriptionType, UserRoleEnum } from '@prisma/client';

// Create Subscription
const createIntoDb = async (req: any) => {
  const { title, price, duration } = req.body;
  const adminId = req.user.id; // Assuming only admin creates subscription

  if (!title || !price || !duration) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing required fields');
  }

  const subscription = await prisma.subscription.create({
    data: {
      title,
      price: parseFloat(price),
      duration, // Should be SubscriptionType enum: MONTHLY | YEARLY
      adminId,
    },
  });

  return subscription;
};

// Get All Active Subscriptions
const getAllSubscription = async () => {
  const subscriptions = await prisma.subscription.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  return subscriptions;
};

// Get Subscription by ID
const getSubscriptionByIdFromDB = async (id: string) => {
  const subscription = await prisma.subscription.findUnique({
    where: { id },
  });

  if (!subscription)
    throw new AppError(httpStatus.NOT_FOUND, 'Subscription not found');

  return subscription;
};

// Update Subscription (Admin only)
const updateIntoDb = async (id: string, data: Partial<any>) => {
  const subscription = await prisma.subscription.update({
    where: { id },
    data: {
      ...(data.title && { title: data.title }),
      ...(data.price && { price: parseFloat(data.price) }),
      ...(data.duration && { duration: data.duration }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });

  return subscription;
};

// Soft Delete Subscription (Admin only)
const deleteIntoDb = async (id: string) => {
  const subscription = await prisma.subscription.update({
    where: { id },
    data: { isActive: false },
  });

  return subscription;
};

// Assign Subscription to User (Coach)
const assignSubscriptionToUser = async (
  userId: string,
  payload: { subscriptionId: string },
) => {
  const { subscriptionId } = payload;

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!subscription)
    throw new AppError(httpStatus.NOT_FOUND, 'Subscription not found');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  const startDate = new Date();
  const endDate = new Date();
  if (subscription.duration === SubscriptionType.MONTHLY) {
    endDate.setMonth(endDate.getMonth() + 1);
  } else if (subscription.duration === SubscriptionType.YEARLY) {
    endDate.setFullYear(endDate.getFullYear() + 1);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionId: subscription.id,
      subscriptionStart: startDate,
      subscriptionEnd: endDate,
    },
  });

  return updatedUser;
};

// Delete My Subscription (Coach)
const deleteMySubscription = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  if (!user.subscriptionId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You do not have an active subscription',
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionId: null,
      subscriptionStart: null,
      subscriptionEnd: null,
    },
  });

  return updatedUser;
};

// Get My Subscription (Coach)
const getMySubscription = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscription: true,
    },
  });

  if (!user || !user.subscription) return null;

  return {
    subscription: user.subscription,
    startDate: user.subscriptionStart,
    endDate: user.subscriptionEnd,
  };
};

export const SubscriptionServices = {
  createIntoDb,
  getAllSubscription,
  getSubscriptionByIdFromDB,
  updateIntoDb,
  deleteIntoDb,
  assignSubscriptionToUser,
  getMySubscription,
  deleteMySubscription,
};
