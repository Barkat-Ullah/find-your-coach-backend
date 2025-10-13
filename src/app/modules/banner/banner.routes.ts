import express from 'express';
import { BannerController } from './banner.controller';
import auth from '../../middlewares/auth';
import { UserRoleEnum } from '@prisma/client';
import { fileUploader } from '../../utils/fileUploader';

const router = express.Router();

router.get('/', BannerController.getAllBanner);
router.get('/:id', BannerController.getBannerById);

router.post(
  '/',
  auth(UserRoleEnum.ADMIN),
  fileUploader.uploadSingle,
  BannerController.createIntoDb,
);

router.delete('/:id', auth(UserRoleEnum.ADMIN), BannerController.deleteIntoDb);

export const BannerRoutes = router;
