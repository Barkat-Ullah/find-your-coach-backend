import catchAsync from '../../utils/catchAsync';
import httpStatus from 'http-status';
import sendResponse from '../../utils/sendResponse';
import { Request, Response } from 'express';
import { ReportServices } from './Report.service';

const createIntoDb = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportServices.createIntoDb(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Report submitted successfully',
    data: result,
  });
});

const getAllReport = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportServices.getAllReport(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reports retrieved successfully',
    data: result.data,
    meta: result.meta,
  });
});

const getMyReport = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportServices.getMyReport(req.user.email);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My reports retrieved successfully',
    data: result,
  });
});

const getReportById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ReportServices.getReportByIdFromDB(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report retrieved successfully',
    data: result,
  });
});

const updateIntoDb = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ReportServices.updateIntoDb(id, req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report updated successfully',
    data: result,
  });
});



const softDeleteIntoDb = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ReportServices.softDeleteIntoDb(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report marked as resolved',
    data: result,
  });
});

export const ReportController = {
  createIntoDb,
  getAllReport,
  getMyReport,
  getReportById,
  updateIntoDb,
  
  softDeleteIntoDb,
};
