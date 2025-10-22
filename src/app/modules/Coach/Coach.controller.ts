import catchAsync from '../../utils/catchAsync';
import httpStatus from 'http-status';
import sendResponse from '../../utils/sendResponse';
import { Request, Response } from 'express';
import { CoachServices } from './Coach.service';

const getAllCoach = catchAsync(async (req: Request, res: Response) => {
  const result = await CoachServices.getAllCoach(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully retrieved all Coach',
    data: result.data,
    meta: result.meta,
  });
});

const getMyCoach = catchAsync(async (req: Request, res: Response) => {
  const result = await CoachServices.getMyCoachAndAthlete(req.user.email);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result.data,
  });
});

const getCoachById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await CoachServices.getCoachByIdFromDB(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully retrieved Coach by id',
    data: result,
  });
});

const getSpecifiCoacheSlotByDate = catchAsync(
  async (req: Request, res: Response) => {
    const result = await CoachServices.getSpecifiCoaches(req);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message:
        result.message ||
        `Successfully fetched ${result.availabilityTime?.coachName} slot date`,
      data: result,
    });
  },
);

const updateIntoDb = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await CoachServices.updateIntoDb(id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully updated Coach',
    data: result,
  });
});

export const CoachController = {
  getAllCoach,
  getMyCoach,
  getCoachById,
  updateIntoDb,
  getSpecifiCoacheSlotByDate,
};
