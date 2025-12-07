import httpStatus from 'http-status';
import admin from './firebaseAdmin';
import AppError from '../../errors/AppError';
import { prisma } from '../../utils/prisma';
import { Request } from 'express';
type SendNotificationParams = {
  userId: string;
  senderId: string;
  title: string;
  body: string;
};

export const sendSingleNotificationUtils = async ({
  userId,
  senderId,
  title,
  body,
}: SendNotificationParams) => {
  if (!title || !body) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Title and body are required');
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });

    if (!user?.fcmToken) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found with FCM token');
    }

    const message = {
      notification: { title, body },
      token: user.fcmToken,
    };

    // Save in DB
    await prisma.notification.create({
      data: { receiverId: userId, senderId, title, body },
    });

    // Send via Firebase
    return await admin.messaging().send(message);
  } catch (error: any) {
    console.error('Error sending notification:', error);

    switch (error.code) {
      case 'messaging/invalid-registration-token':
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Invalid FCM registration token',
        );
      case 'messaging/registration-token-not-registered':
        throw new AppError(
          httpStatus.NOT_FOUND,
          'FCM token is no longer registered',
        );
      default:
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          error.message || 'Failed to send notification',
        );
    }
  }
};

// Send notification to a single user
const sendSingleNotification = async (req: any) => {
  try {
    const { userId } = req.params;
    const { title, body } = req.body;

    if (!title || !body) {
      throw new AppError(400, 'Title and body are required');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    console.log(user?.fcmToken);
    if (!user || !user.fcmToken) {
      throw new AppError(404, 'User not found with FCM token');
    }

    const message = {
      notification: {
        title,
        body,
      },
      token: user.fcmToken,
    };

    await prisma.notification.create({
      data: {
        receiverId: userId,
        senderId: req.user.id,
        title,
        body,
      },
    });

    const response = await admin.messaging().send(message);
    return response;
  } catch (error: any) {
    console.error('Error sending notification:', error);
    if (error.code === 'messaging/invalid-registration-token') {
      throw new AppError(400, 'Invalid FCM registration token');
    } else if (error.code === 'messaging/registration-token-not-registered') {
      throw new AppError(404, 'FCM token is no longer registered');
    } else {
      throw new AppError(500, error.message || 'Failed to send notification');
    }
  }
};

// Send notifications to all users with valid FCM tokens
const sendNotifications = async (req: any) => {
  try {
    const { title, body } = req.body;

    if (!title || !body) {
      throw new AppError(400, 'Title and body are required');
    }

    const users = await prisma.user.findMany({
      where: {
        fcmToken: {
          not: null,
        },
      },
      select: {
        id: true,
        fcmToken: true,
      },
    });

    if (!users || users.length === 0) {
      throw new AppError(404, 'No users found with FCM tokens');
    }

    const fcmTokens = users.map(user => user.fcmToken);

    const message = {
      notification: {
        title,
        body,
      },
      tokens: fcmTokens,
    };

    const response = await admin
      .messaging()
      .sendEachForMulticast(message as any);

    const successIndices = response.responses
      .map((res: any, idx: number) => (res.success ? idx : null))
      .filter((_: any, idx: number) => idx !== null) as number[];

    const successfulUsers = successIndices.map(idx => users[idx]);

    const notificationData = successfulUsers.map(user => ({
      receiverId: user.id,
      senderId: req.user.id,
      title,
      body,
    }));

    await prisma.notification.createMany({
      data: notificationData,
    });

    const failedTokens = response.responses
      .map((res: any, idx: number) => (!res.success ? fcmTokens[idx] : null))
      .filter((token): token is string => token !== null);

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      failedTokens,
    };
  } catch (error: any) {
    throw new AppError(500, error.message || 'Failed to send notifications');
  }
};

// Fetch notifications for the current user

const getNotificationsFromDB = async (req: any) => {
  try {
    const userId = req.user.id;

    // Validate user ID
    if (!userId) {
      throw new AppError(400, 'User ID is required');
    }

    // Fetch notifications for the current user
    const notifications = await prisma.notification.findMany({
      where: {
        receiverId: userId,
      },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Check if notifications exist

    // Return formatted notifications
    return notifications.map(notification => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      sender: {
        id: notification?.sender?.id,
      },
    }));
  } catch (error: any) {
    throw new AppError(500, error.message || 'Failed to fetch notifications');
  }
};

// Fetch a single notification and mark it as read
const getSingleNotificationFromDB = async (
  req: any,
  notificationId: string,
) => {
  try {
    const userId = req.user.id;

    // Validate user and notification ID
    if (!userId) {
      throw new AppError(400, 'User ID is required');
    }

    if (!notificationId) {
      throw new AppError(400, 'Notification ID is required');
    }

    // Fetch the notification
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        receiverId: userId,
      },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            coach: {
              select: {
                fullName: true,
                profile: true,
              },
            },
          },
        },
      },
    });

    if (!notification) {
      throw new AppError(404, 'Notification not found');
    }

    // Mark the notification as read
    const updatedNotification = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    // ✅ ADDED: If sender is null, try to fetch Coach data using senderId
    let senderData: any = null;

    if (notification.sender) {
      // Sender is a User
      senderData = {
        id: notification.sender.id,
        email: notification.sender.email,
        fullName: notification.sender.coach?.fullName || null,
        profile: notification.sender.coach?.profile || null,
      };
    } else if (notification.senderId) {
      // ✅ ADDED: senderId might be a Coach ID, try to fetch Coach
      try {
        const coach = await prisma.coach.findUnique({
          where: { id: notification.senderId },
          select: {
            id: true,
            fullName: true,
            profile: true,
            email: true,
          },
        });

        if (coach) {
          senderData = {
            email: coach.email,
            fullName: coach.fullName,
            profile: coach.profile,
          };
        }
      } catch (error) {
        console.log(
          'Could not fetch coach for senderId:',
          notification.senderId,
        );
      }
    }

    // Return the updated notification
    return {
      id: updatedNotification.id,
      title: updatedNotification.title,
      body: updatedNotification.body,
      isRead: updatedNotification.isRead,
      createdAt: updatedNotification.createdAt,
      // ✅ MODIFIED: Return enriched sender data
      sender: senderData,
    };
  } catch (error: any) {
    throw new AppError(500, error.message || 'Failed to fetch notification');
  }
};

const sendToAdmins = async (req: any, title: string, body: string) => {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  });

  if (!admins.length) throw new AppError(404, 'No admins found');

  await prisma.notification.createMany({
    data: admins.map(admin => ({
      receiverId: admin.id,
      senderId: req.user?.id || 'system',
      title,
      body,
    })),
  });

  return {
    message: 'In-app notifications created successfully for all admins',
    count: admins.length,
  };
};

const adminNotify = async (req: Request) => {
  const userId = req.user.id;

  const notifications = await prisma.notification.findMany({
    where: { receiverId: userId },
    select: {
      id: true,
      receiverId: true,
      senderId: true,
      title: true,
      body: true,
      isRead: true,
      createdAt: true,
      sender: {
        select: {
          id: true,
          email: true,
          coach: {
            select: {
              fullName: true,
              profile: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const unreadCount = await prisma.notification.count({
    where: {
      receiverId: userId,
      isRead: false,
    },
  });

  const enrichedNotifications = await Promise.all(
    notifications.map(async notification => {
      if (!notification.sender && notification.senderId) {
        try {
          const coach = await prisma.coach.findUnique({
            where: { id: notification.senderId },
            select: {
              id: true,
              fullName: true,
              profile: true,
              email: true,
            },
          });

          if (coach) {
            return {
              ...notification,
              sender: {
                id: coach.id,
                email: coach.email,
                coach: {
                  fullName: coach.fullName,
                  profile: coach.profile,
                },
              },
            };
          }
        } catch (error) {
          console.log(
            'Could not fetch coach for senderId:',
            notification.senderId,
          );
        }
      }

      return notification;
    }),
  );

  return {
    notifications: enrichedNotifications,
    unreadCount: unreadCount,
    totalCount: notifications.length,
  };
};
export const notificationServices = {
  sendSingleNotification,
  sendNotifications,
  getNotificationsFromDB,
  getSingleNotificationFromDB,
  sendToAdmins,
  adminNotify,
};
