import express from 'express';
import { ScheduleController } from './Schedule.controller';
import auth from '../../middlewares/auth';
import { UserRoleEnum } from '@prisma/client';

const router = express.Router();

router.get(
  '/slot',
  auth(UserRoleEnum.COACH,UserRoleEnum.ATHLETE),
  ScheduleController.getSlotsByDate,
);
router.post('/', auth(UserRoleEnum.COACH), ScheduleController.createIntoDb);
router.post('/slot/add-slot', auth(UserRoleEnum.COACH), ScheduleController.addNewSlotByCoach);
router.patch('/slot/:slotId',auth(UserRoleEnum.COACH) ,ScheduleController.toggleSlotStatus);

export const ScheduleRoutes = router;
