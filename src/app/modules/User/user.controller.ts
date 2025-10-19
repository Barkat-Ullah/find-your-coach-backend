import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { UserServices } from './user.service';
import { Request } from 'express';
import { IOptions } from '../../utils/calculatePagination';

const getAllUsers = catchAsync(async (req, res) => {
  const result = await UserServices.getAllUsersFromDB(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Users retrieved successfully',
    ...result,
  });
});
const getAllUnApproveCoach = catchAsync(async (req, res) => {
  const options: IOptions = {
    page: Number(req.query.page),
    limit: Number(req.query.limit),
  };

  const result = await UserServices.getAllUnApproveCoach(options);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'All unapproved coaches retrieved successfully',
    data: result.data,
    meta: result.meta,
  });
});

const getMyProfile = catchAsync(async (req, res) => {
  const id = req.user.id;
  const result = await UserServices.getMyProfileFromDB(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Profile retrieved successfully',
    data: result,
  });
});

const getUserDetails = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await UserServices.getUserDetailsFromDB(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'User details retrieved successfully',
    data: result,
  });
});

const updateUserRoleStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const role = req.body.role;
  const result = await UserServices.updateUserRoleStatusIntoDB(id, role);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'User role updated successfully',
    data: result,
  });
});

const updateUserStatus = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const result = await UserServices.updateUserStatus(id, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'User status updated successfully',
    data: result,
  });
});
const updateUserApproval = catchAsync(async (req, res) => {
  const adminId = req.user.id;
  const { id } = req.params;
  const result = await UserServices.updateUserApproval(id, adminId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'User approved successfully',
    data: result,
  });
});
const updateUserDenied = catchAsync(async (req, res) => {
  const adminId = req.user.id;
  const { id } = req.params;
  const result = await UserServices.updateUserDenied(id, adminId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'User denied successfully',
    data: result,
  });
});

const softDeleteUser = catchAsync(async (req, res) => {
  const id = req.user.id;
  const result = await UserServices.softDeleteUserIntoDB(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'User soft deleted successfully',
    data: result,
  });
});
const hardDeleteUser = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const result = await UserServices.hardDeleteUserIntoDB(id, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'User soft deleted successfully',
    data: result,
  });
});

const updateUser = catchAsync(async (req, res) => {
  const id = req.params.id;
  const result = await UserServices.updateUserIntoDb(req, id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User updated successfully!',
    data: result,
  });
});

const updateMyProfile = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  // Multer files
  const profileFile =
    req.files && (req.files as any).profile
      ? (req.files as any).profile[0]
      : undefined;
  const certificationFile =
    req.files && (req.files as any).certificate
      ? (req.files as any).certificate[0]
      : undefined;

  const payload = JSON.parse(req.body.data || '{}');

  const result = await UserServices.updateMyProfile(
    userId,
    role,
    profileFile,
    certificationFile,
    payload,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Profile updated successfully',
    data: result,
  });
});

export const UserControllers = {
  getAllUsers,
  getMyProfile,
  getUserDetails,
  updateUserRoleStatus,
  updateUserStatus,
  updateUserApproval,
  softDeleteUser,
  hardDeleteUser,
  updateUser,
  updateMyProfile,
  getAllUnApproveCoach,
  updateUserDenied,
};
