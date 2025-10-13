import catchAsync from '../../utils/catchAsync';
import httpStatus from 'http-status';
import sendResponse from '../../utils/sendResponse';
import { Request, Response } from 'express';
import { SpecialtyServices } from './Specialty.service';

// ✅ Create specialty
const createIntoDb = catchAsync(async (req: Request, res: Response) => {
  const result = await SpecialtyServices.createIntoDb(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Successfully created Specialty',
    data: result,
  });
});

// ✅ Get all specialties
const getAllSpecialty = catchAsync(async (req: Request, res: Response) => {
  const result = await SpecialtyServices.getAllSpecialty(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully retrieved all Specialties',
    data: result,
  });
});

// ✅ Get specialty by ID
const getSpecialtyById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await SpecialtyServices.getSpecialtyByIdFromDB(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully retrieved Specialty by ID',
    data: result,
  });
});

// ✅ Delete specialty
const deleteIntoDb = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await SpecialtyServices.deleteIntoDb(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully deleted Specialty',
    data: result,
  });
});

export const SpecialtyController = {
  createIntoDb,
  getAllSpecialty,
  getSpecialtyById,
  deleteIntoDb,
};
