// src/app/modules/Favorite/Favorite.controller.ts
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import httpStatus from 'http-status';
import { Request, Response } from 'express';
import { FavoriteServices } from './Favorite.service';


const toggleUserFavorite = catchAsync(async (req: Request, res: Response) => {
  const userEmail = req.user?.email;
  const { coachEmail } = req.body;

  const result = await FavoriteServices.toggleFavorite(userEmail, coachEmail);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.isFavorite
      ? 'Added to favorites'
      : 'Removed from favorites',
    data: result,
  });
});

const getUserFavorites = catchAsync(async (req: Request, res: Response) => {
  const userEmail = req.user?.email;
  const favorites = await FavoriteServices.getFavorites(userEmail);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User favorites retrieved',
    data: favorites,
  });
});

export const FavoriteController = {
  toggleUserFavorite,
  getUserFavorites,
};
