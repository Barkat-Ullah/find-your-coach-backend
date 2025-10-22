import express from 'express';
import { AuthRouters } from '../modules/Auth/Auth.routes';
import { UserRouters } from '../modules/User/user.routes';
import { PaymentRoutes } from '../modules/Payment/payment.route';
import { SpecialtyRoutes } from '../modules/Specialty/Specialty.routes';
import { BannerRoutes } from '../modules/banner/banner.routes';
import { SubscriptionRoutes } from '../modules/Subscription/Subscription.routes';
import { FavoriteRoutes } from '../modules/Favorite/Favorite.routes';
import { ScheduleRoutes } from '../modules/Schedule/Schedule.routes';
import { CoachRoutes } from '../modules/Coach/Coach.routes';
import { ReportRoutes } from '../modules/Report/Report.routes';
import { BookingRoutes } from '../modules/Booking/Booking.routes';
import { ReviewRoutes } from '../modules/Review/Review.routes';
import { MetaRoutes } from '../modules/meta/meta.routes';
// import { notificationsRoute } from '../modules/Notification/Notification.routes';

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

  // {
  //   path: '/notifications',
  //   route: notificationsRoute,
  // },
  {
    path: '/specialties',
    route: SpecialtyRoutes,
  },
  {
    path: '/banner',
    route: BannerRoutes,
  },
  {
    path: '/subscription',
    route: SubscriptionRoutes,
  },
  {
    path: '/favorite',
    route: FavoriteRoutes,
  },
  {
    path: '/schedule',
    route: ScheduleRoutes,
  },
  {
    path: '/coach',
    route: CoachRoutes,
  },
  {
    path: '/report',
    route: ReportRoutes,
  },
  {
    path: '/booking',
    route: BookingRoutes,
  },
  {
    path: '/review',
    route: ReviewRoutes,
  },
  {
    path: '/meta',
    route: MetaRoutes,
  },
];

moduleRoutes.forEach(route => router.use(route.path, route.route));

export default router;
