import httpStatus from 'http-status';
import { BookingStatus, User, UserRoleEnum, UserStatus } from '@prisma/client';
import QueryBuilder from '../../builder/QueryBuilder';
import { prisma } from '../../utils/prisma';

import { Request } from 'express';
import AppError from '../../errors/AppError';
import { uploadToDigitalOceanAWS } from '../../utils/uploadToDigitalOceanAWS';
import { calculatePagination, IOptions } from '../../utils/calculatePagination';

interface UserWithOptionalPassword extends Omit<User, 'password'> {
  password?: string;
}

const getAllUsersFromDB = async (query: any) => {
  const usersQuery = new QueryBuilder<typeof prisma.user>(prisma.user, query);
  usersQuery.where({
    role: {
      in: ['COACH', 'ATHLETE'],
    },
  });
  const result = await usersQuery
    .search(['fullName', 'email', 'address'])
    .filter()
    .where({
      isApproved: true,
      isDenied: false,
    })
    .sort()
    .fields()
    .exclude()
    .paginate()
    .customFields({
      id: true,
      fullName: true,
      email: true,
      role: true,
      status: true,
      isApproved: true,
      isDenied: true,
    })
    .execute();

  const usersWithCount = await Promise.all(
    result.data.map(async (user: any) => {
      const coach = await prisma.coach.findUnique({
        where: { email: user.email },
        select: { id: true },
      });

      const athlete = await prisma.athlete.findUnique({
        where: { email: user.email },
        select: { id: true },
      });

      let bookingCount = 0;

      if (user.role === 'COACH' && coach) {
        bookingCount = await prisma.booking.count({
          where: { coachId: coach.id, status: BookingStatus.FINISHED },
        });
      } else if (user.role === 'ATHLETE' && athlete) {
        bookingCount = await prisma.booking.count({
          where: { athleteId: athlete.id, status: BookingStatus.FINISHED },
        });
      }

      return { ...user, bookingCount };
    }),
  );

  return {
    ...result,
    data: usersWithCount,
  };
};

const getAllUnApproveCoach = async (options: IOptions) => {
  const { skip, limit, page } = calculatePagination(options);

  const data = await prisma.user.findMany({
    where: {
      role: 'COACH',
      isApproved: false,
      isDenied: false,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      status: true,
      isApproved: true,
      isDenied: true,
    },
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' }, 
  });

  const total = await prisma.user.count({
    where: {
      role: 'COACH',
      isApproved: false,
      isDenied: false,
    },
  });

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPage: Math.ceil(total / limit),
    },
  };
};

const getMyProfileFromDB = async (id: string) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: {
      id,
      status: UserStatus.ACTIVE,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      status: true,
    },
  });

  let profileInfo = null;

  if (user.role === UserRoleEnum.ADMIN) {
    profileInfo = await prisma.admin.findUnique({
      where: { email: user.email },
      select: {
        id: true,
        fullName: true,
        profile: true,
        phoneNumber: true,
      },
    });
  } else if (user.role === UserRoleEnum.COACH) {
    profileInfo = await prisma.coach.findUnique({
      where: { email: user.email },
      select: {
        id: true,
        fullName: true,
        email: true,
        profile: true,
        phoneNumber: true,
        experience: true,
        location: true,
        expertise: true,
        certification: true,
        address: true,
        price: true,
        age: true,
        gender: true,
        specialty: {
          select: {
            id: true,
            title: true,
          },
        },
        subscription: {
          select: {
            id: true,
            title: true,
            price: true,
            duration: true,
          },
        },
      },
    });
  } else if (user.role === UserRoleEnum.ATHLETE) {
    profileInfo = await prisma.athlete.findUnique({
      where: { email: user.email },
      select: {
        id: true,
        fullName: true,
        email: true,
        profile: true,
        phoneNumber: true,
        category: true,
        address: true,
      },
    });
  }

  if (!profileInfo) {
    throw new AppError(httpStatus.NOT_FOUND, 'Profile not found!');
  }

  return {
    ...user,
    profile: profileInfo,
  };
};

const getUserDetailsFromDB = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      status: true,
      isApproved: true,
      isDeleted: true,
      isEmailVerified: true,
    },
  });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  let profileInfo = null;
  if (user.role === UserRoleEnum.ADMIN) {
    profileInfo = await prisma.admin.findUnique({
      where: { email: user.email },
      select: {
        id: true,
        fullName: true,
        profile: true,
        phoneNumber: true,
      },
    });
  } else if (user.role === UserRoleEnum.COACH) {
    profileInfo = await prisma.coach.findUnique({
      where: { email: user.email },
      select: {
        id: true,
        fullName: true,
        email: true,
        profile: true,
        phoneNumber: true,
        experience: true,
        location: true,
        expertise: true,
        certification: true,
        address: true,
        price: true,
        isRecommendedPayment: true,
        recommendedTime: true,
        age: true,
        gender: true,
        specialty: {
          select: {
            id: true,
            title: true,
          },
        },
        subscription: {
          select: {
            id: true,
            title: true,
            price: true,
            duration: true,
          },
        },
        booking: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
        review: {
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
          },
        },
      },
    });
  } else if (user.role === UserRoleEnum.ATHLETE) {
    profileInfo = await prisma.athlete.findUnique({
      where: { email: user.email },
      select: {
        id: true,
        fullName: true,
        email: true,
        profile: true,
        phoneNumber: true,
        category: true,
        address: true,
        booking: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            coach: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    });
  }

  if (!profileInfo) {
    throw new AppError(httpStatus.NOT_FOUND, 'Profile details not found!');
  }

  return {
    ...user,
    profile: profileInfo,
  };
};

const updateUserRoleStatusIntoDB = async (id: string, role: UserRoleEnum) => {
  const result = await prisma.user.update({
    where: {
      id: id,
    },
    data: {
      role: role,
    },
  });
  return result;
};

const updateUserStatus = async (userId: string, adminId: string) => {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== UserRoleEnum.ADMIN) {
    throw new AppError(httpStatus.FORBIDDEN, 'Only admin can approve');
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  // Coaches cannot be activated unless approved
  if (user.role === UserRoleEnum.COACH && !user.isApproved) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Coach cannot be activated before approval',
    );
  }

  const newStatus =
    user.status === UserStatus.ACTIVE
      ? UserStatus.RESTRICTED
      : UserStatus.ACTIVE;

  const result = await prisma.user.update({
    where: { id: userId },
    data: { status: newStatus },
    select: { id: true, fullName: true, email: true, role: true, status: true },
  });

  return result;
};

const updateUserApproval = async (userId: string, adminId: string) => {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== UserRoleEnum.ADMIN) {
    throw new AppError(httpStatus.FORBIDDEN, 'Only admin can approve');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  if (user.role !== UserRoleEnum.COACH) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Only coaches can be approved');
  }

  const newApprovalStatus = !user.isApproved;

  const result = await prisma.user.update({
    where: { id: userId },
    data: { isApproved: newApprovalStatus },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      status: true,
      isApproved: true,
      isDenied: true,
    },
  });

  return result;
};

const updateUserDenied = async (userId: string, adminId: string) => {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== UserRoleEnum.ADMIN) {
    throw new AppError(httpStatus.FORBIDDEN, 'Only admin can approve');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  if (user.role !== UserRoleEnum.COACH) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Only coaches can be denied');
  }

  const newApprovalStatus = !user.isDenied;

  const result = await prisma.user.update({
    where: { id: userId },
    data: { isDenied: newApprovalStatus },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      status: true,
      isApproved: true,
      isDenied: true,
    },
  });

  return result;
};

const softDeleteUserIntoDB = async (id: string) => {
  const result = await prisma.user.update({
    where: { id },
    data: { isDeleted: true },
    select: {
      id: true,
      isDeleted: true,
    },
  });
  return result;
};

const hardDeleteUserIntoDB = async (id: string, adminId: string) => {
  // const adminUser = await prisma.user.findUnique({
  //   where: {
  //     id: adminId,
  //     role: UserRoleEnum.ADMIN,
  //   },
  // });
  // if (!adminUser) {
  //   throw new AppError(httpStatus.UNAUTHORIZED, 'You are not a admin');
  // }
  // return await prisma.$transaction(
  //   async tx => {
  //     // related tables delete
  //     await tx.goal.deleteMany({ where: { userId: id } });
  //     await tx.message.deleteMany({ where: { senderId: id } });
  //     await tx.message.deleteMany({ where: { receiverId: id } });
  //     await tx.payment.deleteMany({ where: { userId: id } });
  //     await tx.motivation.deleteMany({ where: { userId: id } });
  //     await tx.notificationUser.deleteMany({ where: { userId: id } });
  //     await tx.vision.deleteMany({ where: { userId: id } });
  //     await tx.community.deleteMany({ where: { userId: id } });
  //     await tx.communityMembers.deleteMany({ where: { userId: id } });
  //     await tx.follow.deleteMany({
  //       where: {
  //         OR: [{ followerId: id }, { followingId: id }],
  //       },
  //     });
  //     const deletedUser = await tx.user.delete({
  //       where: { id },
  //       select: { id: true, email: true },
  //     });
  //     return deletedUser;
  //   },
  //   {
  //     timeout: 20000,
  //     maxWait: 5000,
  //   },
  // );
};

const updateMyProfile = async (
  userId: string,
  role: UserRoleEnum,
  profileFile?: Express.Multer.File,
  certificationFile?: Express.Multer.File,
  payload?: any,
) => {
  // 1️⃣ Get user to fetch email
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) throw new Error('User not found');

  let profileUrl: string | null = null;
  let certificationUrl: string | null = null;

  if (profileFile) {
    const uploaded = await uploadToDigitalOceanAWS(profileFile);
    profileUrl = uploaded.Location;
  }

  if (role === UserRoleEnum.COACH && certificationFile) {
    const uploadedCert = await uploadToDigitalOceanAWS(certificationFile);
    certificationUrl = uploadedCert.Location;
  }

  const updateData: any = { ...payload };
  if (profileUrl) updateData.profile = profileUrl;
  if (certificationUrl) updateData.certification = certificationUrl;

  if (role === UserRoleEnum.ADMIN) {
    return await prisma.admin.update({
      where: { email: user.email },
      data: updateData,
      select: {
        id: true,
        fullName: true,
        email: true,
        profile: true,
        phoneNumber: true,
      },
    });
  }

  if (role === UserRoleEnum.ATHLETE) {
    return await prisma.athlete.update({
      where: { email: user.email },
      data: updateData,
      select: {
        id: true,
        fullName: true,
        email: true,
        profile: true,
        phoneNumber: true,
        category: true,
        address: true,
      },
    });
  }

  if (role === UserRoleEnum.COACH) {
    return await prisma.coach.update({
      where: { email: user.email },
      data: updateData,
      select: {
        id: true,
        fullName: true,
        email: true,
        profile: true,
        phoneNumber: true,
        expertise: true,
        experience: true,
        location: true,
        address: true,
        certification: true,
        specialtyId: true,
        age: true,
        gender: true,
      },
    });
  }
};

const updateUserIntoDb = async (req: Request, id: string) => {
  // Step 1️⃣: Check if user exists
  const userInfo = await prisma.user.findUnique({
    where: { id },
  });

  if (!userInfo) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found with id: ' + id);
  }

  // Step 2️⃣: Parse incoming data
  const { fullName, describe, city, address, phoneNumber } = JSON.parse(
    req.body.data,
  );

  // Step 3️⃣: Handle file upload (optional)
  const file = req.file as Express.Multer.File | undefined;

  let profileUrl: string | null = null;

  if (file) {
    const location = await uploadToDigitalOceanAWS(file);
    profileUrl = location.Location;
  }

  // Step 4️⃣: Update user in DB
  const result = await prisma.user.update({
    where: { id },
    data: {
      fullName,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      status: true,
    },
  });

  if (!result) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to update user profile',
    );
  }

  return result;
};

export const UserServices = {
  getAllUsersFromDB,
  getAllUnApproveCoach,
  getMyProfileFromDB,
  getUserDetailsFromDB,
  updateUserRoleStatusIntoDB,
  updateUserStatus,
  updateUserApproval,
  softDeleteUserIntoDB,
  hardDeleteUserIntoDB,
  updateUserIntoDb,
  updateMyProfile,
  updateUserDenied,
};
