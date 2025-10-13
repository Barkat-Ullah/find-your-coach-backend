import catchAsync from "../../utils/catchAsync";
import httpStatus from "http-status";
import sendResponse from "../../utils/sendResponse";
import { Request, Response } from "express";
import { BannerServices } from "./banner.service";

const createIntoDb = catchAsync(async (req: Request, res: Response) => {
  const result = await BannerServices.createIntoDb(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Successfully created banner",
    data: result,
  });
});

const getAllBanner = catchAsync(async (req: Request, res: Response) => {
  const result = await BannerServices.getAllBanner();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully retrieved all banner",
    data: result,
  });
});



const getBannerById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await BannerServices.getBannerByIdFromDB(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully retrieved banner by id",
    data: result,
  });
});


const deleteIntoDb = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await BannerServices.deleteIntoDb(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully deleted banner",
    data: result,
  });
});



export const BannerController = {
  createIntoDb,
  getAllBanner,

  getBannerById,
  
  deleteIntoDb,
  
};
