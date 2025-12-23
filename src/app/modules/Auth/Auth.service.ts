import sendOtpViaMail, { generateOtpEmail } from './../../utils/sendMail';
import * as bcrypt from 'bcrypt';
import httpStatus from 'http-status';
import { Secret, SignOptions } from 'jsonwebtoken';
import config from '../../../config';
import AppError from '../../errors/AppError';
import { User, UserRoleEnum, UserStatus } from '@prisma/client';
import { Response } from 'express';
import {
  getOtpStatusMessage,
  otpExpiryTime,
  generateOTP,
} from '../../utils/otp';
import sendResponse from '../../utils/sendResponse';
import { generateToken } from '../../utils/generateToken';
import { insecurePrisma, prisma } from '../../utils/prisma';
import emailSender from './../../utils/sendMail';
// import {
//   uploadToDigitalOceanAWS,
// } from '../../utils/uploadToDigitalOceanAWS';
import { toStringArray } from './Auth.constants';
import { uploadToCloudinary } from '../../utils/uploadToCloudinary';

// ======================== LOGIN WITH OTP ========================
const loginWithOtpFromDB = async (
  res: Response,
  payload: { email: string; password: string; fcmToken?: string },
) => {
  const userData = await insecurePrisma.user.findUnique({
    where: { email: payload.email },
  });

  if (!userData) {
    throw new AppError(401, 'User not found');
  }

  const isCorrectPassword = await bcrypt.compare(
    payload.password,
    userData.password,
  );
  if (!isCorrectPassword)
    throw new AppError(httpStatus.BAD_REQUEST, 'Password incorrect');
  if (userData.isDeleted) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'You are deleted !');
  }
  if (userData.role !== UserRoleEnum.ADMIN && !userData.isEmailVerified) {
    const otp = generateOTP().toString();

    await prisma.user.update({
      where: { email: userData.email },
      data: {
        otp,
        otpExpiry: otpExpiryTime(),
        fcmToken: payload?.fcmToken,
      },
    });

    sendOtpViaMail(payload.email, otp, 'OTP Verification');

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Please check your email for the verification OTP.',
      data: '',
    });
  } else {
    const accessToken = await generateToken(
      {
        id: userData.id,
        name: userData.fullName,
        email: userData.email,
        role: userData.role,
      },
      config.jwt.access_secret as Secret,
      config.jwt.access_expires_in as SignOptions['expiresIn'],
    );

    return {
      id: userData.id,
      name: userData.fullName,
      email: userData.email,
      role: userData.role,
      accessToken,
    };
  }
};

const registerAthleteIntoDB = async (
  payload: any,
  profileFile?: Express.Multer.File,
) => {
  if (!payload?.email || !payload?.password || !payload?.fullName) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing required fields');
  }

  const exists = await prisma.user.findUnique({
    where: { email: payload.email },
    select: { id: true },
  });
  if (exists) throw new AppError(httpStatus.CONFLICT, 'User already exists');

  const hashedPassword = await bcrypt.hash(payload.password, 12);
  const otp = generateOTP().toString();

  let profileUrl: string | undefined;

  // if (profileFile) {
  //   try {
  //     const up = await uploadToDigitalOceanAWS(profileFile);
  //     profileUrl = up.Location;
  //   } catch (err) {
  //     throw new AppError(
  //       httpStatus.INTERNAL_SERVER_ERROR,
  //       'Failed to upload profile image',
  //     );
  //   }
  // }

  if (profileFile) {
    const result = await uploadToCloudinary(profileFile);
    profileUrl = result.Location;
  }
  // console.log({ profileFile });

  // normalize category -> string[]
  const categories = toStringArray(payload.category);

  try {
    await prisma.$transaction(async tx => {
      const newUser = await tx.user.create({
        data: {
          fullName: payload.fullName,
          email: payload.email,
          password: hashedPassword,
          role: UserRoleEnum.ATHLETE,
          otp,
          otpExpiry: otpExpiryTime(),
          isApproved: true,
          // fcmToken: payload.fcmToken ?? undefined,
        },
      });

      await tx.athlete.create({
        data: {
          fullName: payload.fullName,
          email: payload.email,
          profile: profileUrl ?? undefined,
          phoneNumber: payload.phoneNumber ?? undefined,
          category: categories,
          address: payload.address ?? undefined,
        },
      });

      const html = generateOtpEmail(otp);
      await emailSender(newUser.email, html, 'OTP Verification');
    });
  } catch (err) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to create athlete',
    );
  }

  return { message: 'Please check your email for OTP and verify your account' };
};

/** Coach registration */
const registerCoachIntoDB = async (
  payload: any,
  profileFile?: Express.Multer.File,
  certificateFile?: Express.Multer.File,
) => {
  if (!payload?.email || !payload?.password || !payload?.fullName) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing required fields');
  }

  const exists = await prisma.user.findUnique({
    where: { email: payload.email },
    select: { id: true },
  });
  if (exists) throw new AppError(httpStatus.CONFLICT, 'User already exists');

  const hashedPassword = await bcrypt.hash(payload.password, 12);
  const otp = generateOTP().toString();

  let profileUrl: string | undefined;
  let certificateUrl: string | undefined;

  // if (profileFile) {
  //   try {
  //     const up = await uploadToDigitalOceanAWS(profileFile);
  //     profileUrl = up.Location;
  //   } catch (err) {
  //     throw new AppError(
  //       httpStatus.INTERNAL_SERVER_ERROR,
  //       'Failed to upload profile image',
  //     );
  //   }
  // }

  // if (certificateFile) {
  //   try {
  //     const up = await uploadToDigitalOceanAWS(certificateFile);
  //     certificateUrl = up.Location;
  //   } catch (err) {
  //     throw new AppError(
  //       httpStatus.INTERNAL_SERVER_ERROR,
  //       'Failed to upload certificate',
  //     );
  //   }
  // }

  if (profileFile) {
    const result = await uploadToCloudinary(profileFile);
    profileUrl = result.Location;
  }
  if (certificateFile) {
    const result = await uploadToCloudinary(certificateFile);
    certificateUrl = result.Location;
  }

  // console.log('register coach', payload.expertise);

  // normalize expertise -> string[]
  const expertiseArr = toStringArray(payload.expertise);

  // console.log('categories', expertiseArr);

  try {
    await prisma.$transaction(async tx => {
      const newUser = await tx.user.create({
        data: {
          fullName: payload.fullName,
          email: payload.email,
          password: hashedPassword,
          role: UserRoleEnum.COACH,
          otp,
          otpExpiry: otpExpiryTime(),
          isApproved: false,
          // fcmToken: payload.fcmToken ?? undefined,
        },
      });

      await tx.coach.create({
        data: {
          fullName: payload.fullName,
          email: payload.email,
          profile: profileUrl ?? undefined,
          phoneNumber: payload.phoneNumber ?? undefined,
          experience: payload.experience ?? undefined,
          price: payload.price ?? null,
          location: payload.location ?? undefined,
          expertise: expertiseArr,
          certification: certificateUrl ?? payload.certification ?? undefined,
          // address: payload.address ?? undefined,
          latitude: payload.latitude ? Number(payload.latitude) : undefined,
          longitude: payload.longitude ? Number(payload.longitude) : undefined,
          specialtyId: payload.specialtyId,
          // gender: payload.gender,
        },
      });

      const html = generateOtpEmail(otp);
      await emailSender(newUser.email, html, 'OTP Verification');
    });
  } catch (err) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to create coach',
    );
  }

  return {
    message:
      'Please check your email for OTP and verify your account. Your coach account will be approved by admin.',
  };
};

// ======================== COMMON OTP VERIFY (REGISTER + FORGOT) ========================
const verifyOtpCommon = async (payload: { email: string; otp: string }) => {
  const user = await prisma.user.findUnique({
    where: { email: payload.email },
    select: {
      id: true,
      email: true,
      otp: true,
      otpExpiry: true,
      isEmailVerified: true,
      fullName: true,
      role: true,
      isApproved: true,
      isDeleted: true,
      isDenied: true,
    },
  });

  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found!');

  if (
    !user.otp ||
    user.otp !== payload.otp ||
    !user.otpExpiry ||
    new Date(user.otpExpiry).getTime() < Date.now()
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid or expired OTP');
  }

  let message = 'OTP verified successfully!';

  if (user.isEmailVerified === false) {
    await prisma.user.update({
      where: { email: user.email },
      data: { otp: null, otpExpiry: null, isEmailVerified: true },
    });

    message = 'Email verified successfully!';

    // Generate access token for registration flow
    const accessToken = await generateToken(
      {
        id: user.id,
        name: user.fullName,
        email: user.email,
        role: user.role,
      },
      config.jwt.access_secret as Secret,
      config.jwt.access_expires_in as SignOptions['expiresIn'],
    );

    return {
      message,
      id: user.id,
      name: user.fullName,
      email: user.email,
      role: user.role,
      isDeleted: user.isDeleted,
      isApproved: user.isApproved,
      isDenied: user.isDenied,
      accessToken,
    };
  }
  // Step 5: Handle forgot password case
  else {
    await prisma.user.update({
      where: { email: user.email },
      data: { otp: null, otpExpiry: null },
    });

    message = 'OTP verified for password reset!';
    return { message };
  }
};

// ======================== RESEND OTP ========================
const resendVerificationWithOtp = async (email: string) => {
  const user = await insecurePrisma.user.findFirst({ where: { email } });
  if (!user) {
    throw new AppError(401, 'User not found');
  }

  if (user.status === UserStatus.RESTRICTED) {
    throw new AppError(httpStatus.FORBIDDEN, 'User is Suspended');
  }

  if (user.isEmailVerified) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Email is already verified');
  }

  const otp = generateOTP().toString();
  const expiry = otpExpiryTime();

  await prisma.user.update({
    where: { email },
    data: { otp, otpExpiry: expiry },
  });

  try {
    await sendOtpViaMail(email, otp, 'OTP Verification');
  } catch {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to send OTP email',
    );
  }

  return {
    message: 'Verification OTP sent successfully. Please check your inbox.',
  };
};

// ======================== CHANGE PASSWORD ========================
const changePassword = async (user: any, payload: any) => {
  const userData = await insecurePrisma.user.findUnique({
    where: { email: user.email, status: 'ACTIVE' },
  });
  if (!userData) {
    throw new AppError(401, 'User not found');
  }

  const isCorrectPassword = await bcrypt.compare(
    payload.oldPassword,
    userData.password,
  );
  if (!isCorrectPassword)
    throw new AppError(httpStatus.BAD_REQUEST, 'Password incorrect!');

  const hashedPassword = await bcrypt.hash(payload.newPassword, 12);

  await prisma.user.update({
    where: { id: userData.id },
    data: { password: hashedPassword },
  });

  return { message: 'Password changed successfully!' };
};

// ======================== FORGOT PASSWORD ========================
const forgetPassword = async (email: string) => {
  const userData = await prisma.user.findUnique({
    where: { email },
    select: { email: true, status: true, id: true, otpExpiry: true, otp: true },
  });
  if (!userData) {
    throw new AppError(401, 'User not found');
  }
  if (userData.status === UserStatus.RESTRICTED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User has been suspended');
  }

  if (
    userData.otp &&
    userData.otpExpiry &&
    new Date(userData.otpExpiry).getTime() > Date.now()
  ) {
    const message = getOtpStatusMessage(userData.otpExpiry);
    throw new AppError(httpStatus.CONFLICT, message);
  }

  const otp = generateOTP().toString();
  const expireTime = otpExpiryTime();

  try {
    await prisma.$transaction(async tx => {
      await tx.user.update({
        where: { email },
        data: { otp, otpExpiry: expireTime },
      });

      try {
        const html = generateOtpEmail(otp);
        await emailSender(userData.email, html, 'OTP Verification');
      } catch {
        await tx.user.update({
          where: { email },
          data: { otp: null, otpExpiry: null },
        });
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Failed to send OTP email',
        );
      }
    });
  } catch {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to send OTP');
  }
};

// ======================== RESET PASSWORD ========================
const resetPassword = async (payload: { password: string; email: string }) => {
  const user = await prisma.user.findUnique({
    where: { email: payload.email },
  });
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found!');

  const hashedPassword = await bcrypt.hash(payload.password, 10);

  await prisma.user.update({
    where: { email: payload.email },
    data: { password: hashedPassword, otp: null, otpExpiry: null },
  });

  return { message: 'Password reset successfully' };
};

const createFirebaseLogin = async (payload: any) => {
  const userData = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
    include: {
      athlete: true,
    },
  });

  // 1️⃣ user not found — create new ATHLETE user only
  if (!userData) {
    const newUser = await prisma.user.create({
      data: {
        fullName: payload.fullName || '',
        email: payload.email,
        password: payload.password || '',
        fcmToken: payload.fcmToken,
        role: UserRoleEnum.ATHLETE,
        isEmailVerified: true,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isEmailVerified: true,
        status: true,
      },
    });

    // Create athlete profile too
    await prisma.athlete.create({
      data: {
        fullName: payload.fullName || '',
        email: payload.email,
        profile: payload.profile || '',
        category: toStringArray(payload.category) || [],
      },
    });

    const accessToken = await generateToken(
      {
        id: newUser.id,
        name: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
      },
      config.jwt.access_secret as Secret,
      config.jwt.access_expires_in as SignOptions['expiresIn'],
    );

    return { user: newUser, accessToken };
  }

  // 2️⃣ user exists but not athlete — reject login
  if (userData.role !== UserRoleEnum.ATHLETE) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Only athletes can log in using Google',
    );
  }

  // 3️⃣ user exists and is athlete — update token
  const updatedUser = await prisma.user.update({
    where: { email: payload.email },
    data: {
      fcmToken: payload.fcmToken,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
    },
  });

  const accessToken = await generateToken(
    {
      id: updatedUser.id,
      name: updatedUser.fullName,
      email: updatedUser.email,
      role: updatedUser.role,
    },
    config.jwt.access_secret as Secret,
    config.jwt.access_expires_in as SignOptions['expiresIn'],
  );

  return { user: updatedUser, accessToken };
};

// ======================== EXPORT ========================
export const AuthServices = {
  loginWithOtpFromDB,
  registerCoachIntoDB,
  registerAthleteIntoDB,
  resendVerificationWithOtp,
  changePassword,
  forgetPassword,
  resetPassword,
  verifyOtpCommon,
  createFirebaseLogin,
};
