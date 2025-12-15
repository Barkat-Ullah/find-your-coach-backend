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
            role: true,
            // Include athlete details if sender is an athlete
            athlete: {
              select: {
                id: true,
                fullName: true,
                profile: true,
                email: true,
              },
            },
            // Include coach details if sender is a coach
            coach: {
              select: {
                id: true,
                fullName: true,
                profile: true,
                email: true,
                specialty: {
                  select: {
                    title: true,
                  },
                },
              },
            },
            admin: {
              select: {
                id: true,
                fullName: true,
                profile: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Return formatted notifications with complete sender info
    return notifications.map(notification => {
      // Determine sender details based on role
      let senderInfo = null;

      if (notification.sender) {
        if (
          notification.sender.role === 'ATHLETE' &&
          notification.sender.athlete
        ) {
          senderInfo = {
            id: notification.sender.id,
            email: notification.sender.email,
            role: notification.sender.role,
            fullName: notification.sender.athlete.fullName,
            profile: notification.sender.athlete.profile,
          };
        } else if (
          notification.sender.role === 'COACH' &&
          notification.sender.coach
        ) {
          senderInfo = {
            id: notification.sender.id,
            email: notification.sender.email,
            role: notification.sender.role,
            fullName: notification.sender.coach.fullName,
            profile: notification.sender.coach.profile,
            specialty: notification.sender.coach.specialty?.title || null,
          };
        } else if (notification.sender.role === 'ADMIN') {
          senderInfo = {
            id: notification.sender.id,
            email: notification.sender.email,
            role: notification.sender.role,
            fullName: notification.sender.admin?.fullName ?? 'Admin',
            profile: notification.sender.admin?.profile ?? null,
          };
        }
      }

      return {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
        sender: senderInfo,
      };
    });
  } catch (error: any) {
    throw new AppError(500, error.message || 'Failed to fetch notifications');
  }
};

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

    // Fetch the notification with complete sender information
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        receiverId: userId,
      },
      include: {
        // ✅ IMPROVED: Include complete sender information
        sender: {
          select: {
            id: true,
            email: true,
            role: true,
            athlete: {
              select: {
                id: true,
                fullName: true,
                profile: true,
                email: true,
                phoneNumber: true,
              },
            },
            coach: {
              select: {
                id: true,
                fullName: true,
                profile: true,
                email: true,
                phoneNumber: true,
                specialty: {
                  select: {
                    id: true,
                    title: true,
                    icon: true,
                  },
                },
                experience: true,
                price: true,
              },
            },
            admin: {
              select: {
                id: true,
                fullName: true,
                profile: true,
                email: true,
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
    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    // Format sender data based on role
    let senderData = null;

    if (notification.sender) {
      if (
        notification.sender.role === 'ATHLETE' &&
        notification.sender.athlete
      ) {
        senderData = {
          id: notification.sender.id,
          email: notification.sender.email,
          role: notification.sender.role,
          fullName: notification.sender.athlete.fullName,
          profile: notification.sender.athlete.profile,
          phoneNumber: notification.sender.athlete.phoneNumber,
        };
      } else if (
        notification.sender.role === 'COACH' &&
        notification.sender.coach
      ) {
        senderData = {
          id: notification.sender.id,
          email: notification.sender.email,
          role: notification.sender.role,
          fullName: notification.sender.coach.fullName,
          profile: notification.sender.coach.profile,
          phoneNumber: notification.sender.coach.phoneNumber,
          specialty: notification.sender.coach.specialty,
          experience: notification.sender.coach.experience,
          price: notification.sender.coach.price,
        };
      } else if (notification.sender.role === 'ADMIN') {
        senderData = {
          id: notification.sender.id,
          email: notification.sender.email,
          role: notification.sender.role,
          fullName: notification.sender.admin?.fullName ?? 'Admin',
          profile: notification.sender.admin?.profile ?? null,
        };
      }
    }

    return {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
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
