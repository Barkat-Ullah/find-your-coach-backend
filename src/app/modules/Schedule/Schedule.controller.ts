import catchAsync from "../../utils/catchAsync";
import httpStatus from "http-status";
import sendResponse from "../../utils/sendResponse";
import { Request, Response } from "express";
import { ScheduleServices } from "./Schedule.service";

const createIntoDb = catchAsync(async (req: Request, res: Response) => {
  const result = await ScheduleServices.createIntoDb(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Successfully created Schedule",
    data: result,
  });
});

const getAllSchedule = catchAsync(async (req: Request, res: Response) => {
  const result = await ScheduleServices.getAllSchedule(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully retrieved all Schedule",
    data: result,
  });
});

const getMySchedule = catchAsync(async (req: Request, res: Response) => {  
  const result = await ScheduleServices.getMySchedule(req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully retrieved my Schedule",
    data: result,
  });
});

const getScheduleById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ScheduleServices.getScheduleByIdFromDB(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully retrieved Schedule by id",
    data: result,
  });
});

const updateIntoDb = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ScheduleServices.updateIntoDb(id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully updated Schedule",
    data: result,
  });
});

const deleteIntoDb = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ScheduleServices.deleteIntoDb(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully deleted Schedule",
    data: result,
  });
});

const softDeleteIntoDb = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ScheduleServices.softDeleteIntoDb(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully soft deleted Schedule",
    data: result,
  });
});

export const ScheduleController = {
  createIntoDb,
  getAllSchedule,
  getMySchedule, 
  getScheduleById,
  updateIntoDb,
  deleteIntoDb,
  softDeleteIntoDb,
};
