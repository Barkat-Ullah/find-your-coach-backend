import express from 'express';
import { PaymentController } from './payment.controller';
import auth from '../../middlewares/auth';
import { UserRoleEnum } from '@prisma/client';

const router = express.Router();

router.get(
  '/admin',
  auth(UserRoleEnum.ADMIN),
  PaymentController.getAllForAdmin,
);
router.post('/cancel/:id', auth('ANY'), PaymentController.cancelPayment);
router.get(
  '/admin/:id',
  auth(UserRoleEnum.ADMIN),
  PaymentController.getSingleForAdmin,
);
router.get('/', PaymentController.getAllForUser);
router.get('/:id', PaymentController.getSingleForUser);
router.get(
  '/session/:stripeSessionId',
 
  PaymentController.singleTransactionHistoryBySessionId,
);

export const PaymentRoutes = router;
