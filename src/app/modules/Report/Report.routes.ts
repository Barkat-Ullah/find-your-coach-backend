import express from 'express';
import { ReportController } from './Report.controller';
import auth from '../../middlewares/auth';

import validateRequest from '../../middlewares/validateRequest';
import { ReportValidation } from './Report.validation';
import { UserRoleEnum } from '@prisma/client';

const router = express.Router();

// Admin routes - Get all reports
router.get('/', auth(UserRoleEnum.ADMIN), ReportController.getAllReport);

// Athlete routes - Get my reports
router.get('/my', auth(UserRoleEnum.ATHLETE), ReportController.getMyReport);

// Admin routes - Get report by ID
router.get('/:id', auth(UserRoleEnum.ADMIN), ReportController.getReportById);

// Athlete routes - Create report
router.post(
  '/',
  auth(UserRoleEnum.ATHLETE),
  validateRequest.body(ReportValidation.createReportValidationSchema),
  ReportController.createIntoDb,
);

// Admin routes - Update report (change status)
router.patch(
  '/:id',
  auth(UserRoleEnum.ADMIN),
  ReportController.updateIntoDb,
);

// Admin routes - Soft delete report (mark as resolved)
router.delete(
  '/soft/:id',
  auth(UserRoleEnum.ADMIN),
  ReportController.softDeleteIntoDb,
);

export const ReportRoutes = router;
