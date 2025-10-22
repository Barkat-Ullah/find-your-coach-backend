import catchAsync from '../../utils/catchAsync';
import httpStatus from 'http-status';
import sendResponse from '../../utils/sendResponse';
import { Request, Response } from 'express';
import { ScheduleServices } from './Schedule.service';

const createIntoDb = catchAsync(async (req: Request, res: Response) => {
  const result = await ScheduleServices.createIntoDb(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Successfully created Schedule',
    data: result,
  });
});

const getSlotsByDate = catchAsync(async (req: Request, res: Response) => {
  const result = await ScheduleServices.getSlotsByDate(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message || 'Successfully retrieved all slots',
    data: result,
  });
});
const toggleSlotStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await ScheduleServices.toggleSlotStatus(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result.slot,
  });
});

const addNewSlotByCoach = catchAsync(async (req: Request, res: Response) => {
  const result = await ScheduleServices.addNewSlot(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: result.success,
    message: result.message,
    data: result.slot,
  });
});

export const ScheduleController = {
  createIntoDb,
  getSlotsByDate,
  addNewSlotByCoach,
  toggleSlotStatus,
};
