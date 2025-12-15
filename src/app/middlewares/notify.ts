import { prisma } from '../utils/prisma';
import admin from 'firebase-admin';

interface CreateNotificationParams {
  receiverId: string;
  senderId: string | null;
  title: string;
  body: string;
}

export const createNotification = async (params: CreateNotificationParams) => {
  const { receiverId, senderId, title, body } = params;

  const notification = await prisma.notification.create({
    data: {
      receiverId,
      senderId,
      title,
      body,
      isRead: false,
    },
    include: {
      sender: {
        select: {
          id: true,
          email: true,
          role: true,
          athlete: {
            select: {
              fullName: true,
              profile: true,
            },
          },
          coach: {
            select: {
              fullName: true,
              profile: true,
            },
          },
          admin: {
            select: {
              fullName: true,
              profile: true,
            },
          },
        },
      },
    },
  });

  return notification;
};

export const createBulkNotifications = async (
  notifications: CreateNotificationParams[],
) => {
  const result = await prisma.notification.createMany({
    data: notifications,
  });

  return result;
};
