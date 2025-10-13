import express from 'express';
import validateRequest from '../../middlewares/validateRequest';
import auth from '../../middlewares/auth';
import { UserRoleEnum } from '@prisma/client';
import { authValidation } from './Auth.validation';
import { AuthControllers } from './Auth.controller';
import { fileUploader } from '../../utils/fileUploader';

const router = express.Router();

router.post(
  '/login',
  validateRequest.body(authValidation.loginUser),
  AuthControllers.loginWithOtp,
);

router.post(
  '/register/athlete',
  fileUploader.upload.fields([{ name: 'profile', maxCount: 1 }]),
  AuthControllers.registerAthlete,
);

router.post(
  '/register/coach',
  fileUploader.upload.fields([
    { name: 'profile', maxCount: 1 },
    { name: 'certificate', maxCount: 1 },
  ]),
  AuthControllers.registerCoach,
);

router.post('/logout', AuthControllers.logoutUser);

router.post('/verify-email-with-otp', AuthControllers.verifyOtpCommon);

router.post(
  '/resend-verification-with-otp',
  AuthControllers.resendVerificationWithOtp,
);

router.post(
  '/change-password',
  auth(UserRoleEnum.ATHLETE, UserRoleEnum.COACH, UserRoleEnum.ADMIN),
  AuthControllers.changePassword,
);

router.post(
  '/forget-password',
  validateRequest.body(authValidation.forgetPasswordValidationSchema),
  AuthControllers.forgetPassword,
);

router.post(
  '/reset-password',
  validateRequest.body(authValidation.resetPasswordValidationSchema),
  AuthControllers.resetPassword,
);

export const AuthRouters = router;
