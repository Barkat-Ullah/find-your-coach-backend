import express from 'express';
import auth from '../../middlewares/auth';
import { notificationController } from './Notification.controller';
import { UserRoleEnum } from '@prisma/client';

const router = express.Router();

router.get(
  '/',
  auth(UserRoleEnum.ATHLETE, UserRoleEnum.COACH),
  notificationController.getNotifications,
);
router.get(
  '/:notificationId',
  auth(UserRoleEnum.ATHLETE, UserRoleEnum.COACH),
  notificationController.getSingleNotificationById,
);

router.post(
  '/send-notification/:userId',
  auth(),
  notificationController.sendNotification,
);

router.post(
  '/send-notification',
  auth(),
  notificationController.sendNotifications,
);

router.post('/send-to-admins', auth(), notificationController.sendToAdmins);

router.get(
  '/admin',
  auth(UserRoleEnum.ADMIN),
  notificationController.getAllNotificationsForAdmin,
);


export const notificationsRoute = router;
