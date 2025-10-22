import express from 'express';
import { BookingController } from './Booking.controller';
import auth from '../../middlewares/auth';
import { UserRoleEnum } from '@prisma/client';

const router = express.Router();

router.get('/', BookingController.getAllBooking);
router.get(
  '/my',
  auth(UserRoleEnum.ATHLETE, UserRoleEnum.COACH),
  BookingController.getMyBooking,
);
router.get(
  '/finished-booking',
  auth(UserRoleEnum.ATHLETE, UserRoleEnum.COACH),
  BookingController.getMyFinishedBooking,
);
router.get(
  '/reschedule/pending',
  auth(UserRoleEnum.ATHLETE, UserRoleEnum.COACH),
  BookingController.getPendingRescheduleRequests,
);

router.post(
  '/reschedule/request',
  auth(UserRoleEnum.ATHLETE, UserRoleEnum.COACH),
  BookingController.requestReschedule,
);

router.post(
  '/reschedule/respond',
  auth(UserRoleEnum.ATHLETE, UserRoleEnum.COACH),
  BookingController.respondToReschedule,
);

//main booking creation route
router.post('/', auth(UserRoleEnum.ATHLETE), BookingController.createIntoDb);

router.patch(
  '/:bookingId/cancel',
  auth(UserRoleEnum.ATHLETE, UserRoleEnum.COACH),
  BookingController.cancelBooking,
);

router.patch(
  '/:bookingId/finish',
  auth(UserRoleEnum.COACH),
  BookingController.finishBooking,
);
export const BookingRoutes = router;
