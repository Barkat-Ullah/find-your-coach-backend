import express from 'express';
import { CoachController } from './Coach.controller';
import auth from '../../middlewares/auth';
import { UserRoleEnum } from '@prisma/client';

const router = express.Router();

router.get(
  '/',
  auth(UserRoleEnum.ADMIN, UserRoleEnum.COACH, UserRoleEnum.ATHLETE),
  CoachController.getAllCoach,
);
router.get(
  '/my',
  auth(UserRoleEnum.ATHLETE, UserRoleEnum.COACH),
  CoachController.getMyCoach,
);
router.get('/coach-slot/:coachId', CoachController.getSpecifiCoacheSlotByDate);
router.get(
  '/:id',
  auth(UserRoleEnum.ADMIN, UserRoleEnum.COACH, UserRoleEnum.ATHLETE),
  CoachController.getCoachById,
);

router.patch('/:id', CoachController.updateIntoDb);

export const CoachRoutes = router;
