import express from 'express';
import { ReviewController } from './Review.controller';
import auth from '../../middlewares/auth';
import { UserRoleEnum } from '@prisma/client';

const router = express.Router();

router.get(
  '/',
  auth(UserRoleEnum.ATHLETE, UserRoleEnum.COACH, UserRoleEnum.ADMIN),
  ReviewController.getAllReview,
);
router.get('/my', auth(UserRoleEnum.ATHLETE), ReviewController.getMyReview);
router.get(
  '/:id',
  auth(UserRoleEnum.ATHLETE, UserRoleEnum.COACH, UserRoleEnum.ADMIN),
  ReviewController.getReviewById,
);

router.post('/', auth(UserRoleEnum.ATHLETE), ReviewController.createIntoDb);

router.patch('/:id', auth(UserRoleEnum.ATHLETE), ReviewController.updateIntoDb);

export const ReviewRoutes = router;
