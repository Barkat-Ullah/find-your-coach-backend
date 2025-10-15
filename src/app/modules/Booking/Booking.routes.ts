import express from 'express';
import { BookingController } from './Booking.controller';
import validateRequest from '../../middlewares/validateRequest';
import { BookingValidation } from './Booking.validation';
import auth from '../../middlewares/auth';
import { UserRoleEnum } from '@prisma/client';

const router = express.Router();

router.get('/', BookingController.getAllBooking);
router.get(
  '/my',
  auth(UserRoleEnum.ATHLETE, UserRoleEnum.COACH),
  BookingController.getMyBooking,
);

router.post('/', auth(UserRoleEnum.ATHLETE), BookingController.createIntoDb);

export const BookingRoutes = router;
