import catchAsync from "../../utils/catchAsync";
import httpStatus from "http-status";
import sendResponse from "../../utils/sendResponse";
import { Request, Response } from "express";
import { ReviewServices } from "./Review.service";

const createIntoDb = catchAsync(async (req: Request, res: Response) => {
  const result = await ReviewServices.createIntoDb(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Successfully created Review",
    data: result,
  });
});

const getAllReview = catchAsync(async (req: Request, res: Response) => {
  const result = await ReviewServices.getAllReview(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully retrieved all Review",
    data: result,
  });
});

const getMyReview = catchAsync(async (req: Request, res: Response) => {  
  const result = await ReviewServices.getMyReview(req.user.email);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully retrieved my Review",
    data: result,
  });
});

const getReviewById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ReviewServices.getReviewByIdFromDB(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully retrieved Review by id",
    data: result,
  });
});

const updateIntoDb = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {email} = req.user
  const result = await ReviewServices.updateIntoDb(id,email, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully updated Review",
    data: result,
  });
});



export const ReviewController = {
  createIntoDb,
  getAllReview,
  getMyReview, 
  getReviewById,
  updateIntoDb,
};
