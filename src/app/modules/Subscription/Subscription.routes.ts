import express from 'express';
import { SubscriptionController } from './Subscription.controller';

import { UserRoleEnum } from '@prisma/client';
import auth from '../../middlewares/auth';


const router = express.Router();

router.get('/', SubscriptionController.getAllSubscription);
router.get(
  '/my-subscription',
  auth(UserRoleEnum.COACH),
  SubscriptionController.getMySubscription,
);
router.get('/:id', SubscriptionController.getSubscriptionById);
//user-select subscription
router.post('/assign', auth(UserRoleEnum.COACH), SubscriptionController.assignSubscription);
// admin create subscription
router.post('/', auth(UserRoleEnum.ADMIN), SubscriptionController.createIntoDb);
router.put(
  '/:id',
  auth(UserRoleEnum.ADMIN),
  SubscriptionController.updateIntoDb,
);

router.delete(
  '/delete-my-subscription',
  auth(UserRoleEnum.COACH),
  SubscriptionController.deleteMySubscription,
);

router.delete(
  '/:id',
  auth(UserRoleEnum.ADMIN),
  SubscriptionController.deleteIntoDb,
);

export const SubscriptionRoutes = router;
