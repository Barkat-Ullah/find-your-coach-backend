import express from 'express';
import { FavoriteController } from './Favorite.controller';
import auth from '../../middlewares/auth';
import { UserRoleEnum } from '@prisma/client';

const router = express.Router();

router.get(
  '/athlete',
  auth(UserRoleEnum.ATHLETE),
  FavoriteController.getUserFavorites,
);
router.post(
  '/athlete',
  auth(UserRoleEnum.ATHLETE),
  FavoriteController.toggleUserFavorite,
);

export const FavoriteRoutes = router;
