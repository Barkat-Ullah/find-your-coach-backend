import express from 'express';
import { NotificationsRouters } from '../modules/Notification/notification.route';
import { AuthRouters } from '../modules/Auth/Auth.routes';
import { UserRouters } from '../modules/User/user.routes';
import { PaymentRoutes } from '../modules/Payment/payment.route';
import { SpecialtyRoutes } from '../modules/Specialty/Specialty.routes';
import { BannerRoutes } from '../modules/banner/banner.routes';


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
    path: '/notifications',
    route: NotificationsRouters,
  },
  {
    path: '/specialties',
    route: SpecialtyRoutes,
  },
  {
    path: '/banner',
    route: BannerRoutes,
  },
];

moduleRoutes.forEach(route => router.use(route.path, route.route));

export default router;
