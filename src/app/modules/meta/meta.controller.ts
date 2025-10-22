import catchAsync from '../../utils/catchAsync';
import httpStatus from 'http-status';
import sendResponse from '../../utils/sendResponse';
import { Request, Response } from 'express';
import { MetaServices } from './meta.service';

const getDashboardData = catchAsync(async (req: Request, res: Response) => {
  const adminId = req.user.id;
  const result = await MetaServices.getDashboardData(adminId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully retrieved all meta',
    data: result,
  });
});
const getUserStatsController = catchAsync(
  async (req: Request, res: Response) => {
    const { period } = req.query;
    const result = await MetaServices.getUserStats(period as string);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Successfully retrieved all meta',
      data: result,
    });
  },
);
const getPopularAthletesController = catchAsync(
  async (req: Request, res: Response) => {
    const { period } = req.query;
    const result = await MetaServices.getPopularAthletes(period as string);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Successfully retrieved all meta',
      data: result,
    });
  },
);
const getPopularCoachesController = catchAsync(
  async (req: Request, res: Response) => {
    const { period } = req.query;
    const result = await MetaServices.getPopularCoaches(period as string);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Successfully retrieved all meta',
      data: result,
    });
  },
);

const getHomePageData = catchAsync(async (req: Request, res: Response) => {
  const result = await MetaServices.getHomePageData(req.user.email);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully retrieved all meta',
    data: result,
  });
});

export const MetaController = {
  getDashboardData,
  getUserStatsController,
  getPopularAthletesController,
  getPopularCoachesController,
  getHomePageData,
};
