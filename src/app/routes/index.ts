import express from 'express';
import { NotificationsRouters } from '../modules/Notification/notification.route';
import { AuthRouters } from '../modules/Auth/Auth.routes';
import { UserRouters } from '../modules/User/user.routes';
import { PaymentRoutes } from '../modules/Payment/payment.route';
import { FollowRoutes } from '../modules/follow/follow.routes';

const router = express.Router();

const moduleRoutes = [
  {
    path: '/auth',
    route: AuthRouters,
  },
  {
    path: '/user',
    route: UserRouters,
  },
  {
    path: '/payment',
    route: PaymentRoutes,
  },
  {
    path: '/follow',
    route: FollowRoutes,
  },
  {
    path: '/notifications',
    route: NotificationsRouters,
  },
];

moduleRoutes.forEach(route => router.use(route.path, route.route));

export default router;
