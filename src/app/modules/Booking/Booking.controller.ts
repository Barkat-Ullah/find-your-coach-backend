import catchAsync from '../../utils/catchAsync';
import httpStatus from 'http-status';
import sendResponse from '../../utils/sendResponse';
import { Request, Response } from 'express';
import { BookingServices } from './Booking.service';

const createIntoDb = catchAsync(async (req: Request, res: Response) => {
  const result = await BookingServices.createIntoDb(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Successfully created Booking',
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
const getMyFinishedBooking = catchAsync(async (req: Request, res: Response) => {
  const result = await BookingServices.getMyFinishedBooking(req.user.email);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully retrieved my finished Booking',
    data: result,
  });
});

const getAllBooking = catchAsync(async (req: Request, res: Response) => {
  const result = await BookingServices.getAllBooking(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully retrieved all Booking',
    data: result.data,
    meta: result.meta,
  });
});

const requestReschedule = catchAsync(async (req: Request, res: Response) => {
  const { email, role } = req.user;
  console.log(req.user)
  const result = await BookingServices.requestReschedule(email, role, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reschedule request created successfully',
    data: result,
  });
});

const respondToReschedule = catchAsync(async (req: Request, res: Response) => {
   const { email, role } = req.user;
  const result = await BookingServices.respondToReschedule(
    email,
    role,
    req.body,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Reschedule request ${req.body.status.toLowerCase()}ed successfully`,
    data: result,
  });
});

const cancelBooking = catchAsync(async (req: Request, res: Response) => {
  const { email, role } = req.user;
  const { bookingId } = req.params;

  const result = await BookingServices.cancelBooking(email, role, bookingId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Booking cancelled successfully',
    data: result,
  });
});

const finishBooking = catchAsync(async (req: Request, res: Response) => {
  const { email, role } = req.user;
  const { bookingId } = req.params;

  const result = await BookingServices.finishBooking(email, role, bookingId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Booking finished successfully',
    data: result,
  });
});

const getPendingRescheduleRequests = catchAsync(
  async (req: Request, res: Response) => {
     const { email, role } = req.user;
    const result = await BookingServices.getPendingRescheduleRequests(
      email,
      role,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Pending reschedule requests retrieved successfully',
      data: result,
    });
  },
);
export const BookingController = {
  createIntoDb,
  getAllBooking,
  getMyBooking,
  getMyFinishedBooking,
  getPendingRescheduleRequests,
  respondToReschedule,
  requestReschedule,
  cancelBooking,
  finishBooking,
};
