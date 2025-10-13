import express from 'express';
import { SpecialtyController } from './Specialty.controller';
import auth from '../../middlewares/auth';
import { UserRoleEnum } from '@prisma/client';
import { fileUploader } from '../../utils/fileUploader';

const router = express.Router();

// ✅ Get all specialties
router.get('/', SpecialtyController.getAllSpecialty);

// ✅ Get specialty by ID
router.get('/:id', SpecialtyController.getSpecialtyById);

// ✅ Create specialty (admin only)
router.post(
  '/',
  auth(UserRoleEnum.ADMIN),
  fileUploader.uploadSingle,
  SpecialtyController.createIntoDb,
);

// ✅ Delete specialty (admin only)
router.delete(
  '/:id',
  auth(UserRoleEnum.ADMIN),
  SpecialtyController.deleteIntoDb,
);

export const SpecialtyRoutes = router;
