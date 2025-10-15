import catchAsync from "../../utils/catchAsync";
import httpStatus from "http-status";
import sendResponse from "../../utils/sendResponse";
import { Request, Response } from "express";
import { BookingServices } from "./Booking.service";

const createIntoDb = catchAsync(async (req: Request, res: Response) => {
  const result = await BookingServices.createIntoDb(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Successfully created Booking",
    data: result,
  });
});


const getMyBooking = catchAsync(async (req: Request, res: Response) => {  
  const result = await BookingServices.getMyBooking(req.user.email);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully retrieved my Booking',
    data: result,
  });
});


const getAllBooking = catchAsync(async (req: Request, res: Response) => {
  const result = await BookingServices.getAllBooking(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully retrieved all Booking",
    data: result.data,
    meta: result.meta,
  });
});
export const BookingController = {
  createIntoDb,
  getAllBooking,
  getMyBooking, 
};
