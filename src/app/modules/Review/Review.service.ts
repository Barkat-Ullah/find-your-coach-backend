import { PrismaClient, BookingStatus, UserRoleEnum } from '@prisma/client';
import { Request } from 'express';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';

const prisma = new PrismaClient();

const createIntoDb = async (req: Request) => {
  const { email } = req.user;
  const { bookingId, rating, comment } = req.body;

  // Find the athlete
  const athlete = await prisma.athlete.findUnique({
    where: { email },
    select: {
      id: true,
    },
  });

  if (!athlete) {
    throw new AppError(httpStatus.NOT_FOUND, 'Athlete not found');
  }

  // Verify the booking belongs to this athlete, has no existing review, and status is FINISHED
  const existingBooking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      athleteId: true,
      coachId: true,
      status: true,
      review: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!existingBooking || existingBooking.athleteId !== athlete.id) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Unauthorized to review this booking',
    );
  }

  if (existingBooking.review) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Review already exists for this booking',
    );
  }

  if (existingBooking.status !== BookingStatus.FINISHED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Booking must be finished to leave a review',
    );
  }

  // Create the review
  const result = await prisma.review.create({
    data: {
      bookingId,
      athleteId: athlete.id,
      coachId: existingBooking.coachId,
      rating,
      comment,
    },
    select: {
      id: true,
      bookingId: true,
      athleteId: true,
      coachId: true,
      rating: true,
      comment: true,
      createdAt: true,
      updatedAt: true,
      booking: {
        select: {
          id: true,
          athleteId: true,
          coachId: true,
          timeSlotId: true,
          bookingDate: true,
          status: true,
          athlete: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          coach: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          timeSlot: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
            },
          },
        },
      },
    },
  });

  return result;
};

const getAllReview = async (query: Record<string, any>) => {
  const { page = 1, limit = 10, search } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const whereCondition: any = {};

  if (search) {
    whereCondition.OR = [
      { comment: { contains: search, mode: 'insensitive' } },
      {
        booking: {
          athlete: { fullName: { contains: search, mode: 'insensitive' } },
        },
      },
      {
        booking: {
          coach: { fullName: { contains: search, mode: 'insensitive' } },
        },
      },
    ];
  }

  const result = await prisma.review.findMany({
    where: whereCondition,
    select: {
      id: true,
      bookingId: true,
      athleteId: true,
      coachId: true,
      rating: true,
      comment: true,
      createdAt: true,
      updatedAt: true,
      booking: {
        select: {
          id: true,
          athleteId: true,
          coachId: true,
          timeSlotId: true,
          bookingDate: true,
          status: true,
          athlete: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          coach: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          timeSlot: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
            },
          },
        },
      },
      athlete: {
        select: {
          id: true,
          fullName: true,
        },
      },
      coach: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    skip,
    take: Number(limit),
  });

  const total = await prisma.review.count({ where: whereCondition });

  return {
    data: result,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
};

const getMyReview = async (email: string) => {
  const athlete = await prisma.athlete.findUnique({
    where: {
      email,
    },
  });
  if (!athlete) {
    throw new AppError(httpStatus.NOT_FOUND, 'Athlete not found');
  }
  // Assuming userId is athlete.id for athlete role
  const result = await prisma.review.findMany({
    where: {
      athleteId: athlete?.id,
    },
    select: {
      id: true,
      bookingId: true,
      athleteId: true,
      coachId: true,
      rating: true,
      comment: true,
      createdAt: true,
      updatedAt: true,
      booking: {
        select: {
          id: true,
          athleteId: true,
          coachId: true,
          timeSlotId: true,
          bookingDate: true,
          status: true,
          coach: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phoneNumber: true,
              profile: true,
              experience: true,
              specialty: {
                select: {
                  id: true,
                  title: true,
                  icon: true,
                },
              },
            },
          },
          timeSlot: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
            },
          },
        },
      },
      coach: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return result;
};

const getReviewByIdFromDB = async (id: string) => {
  const result = await prisma.review.findUnique({
    where: { id },
    select: {
      id: true,
      bookingId: true,
      athleteId: true,
      coachId: true,
      rating: true,
      comment: true,
      createdAt: true,
      updatedAt: true,
      booking: {
        select: {
          id: true,
          athleteId: true,
          coachId: true,
          timeSlotId: true,
          bookingDate: true,
          status: true,
          athlete: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          coach: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          timeSlot: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
            },
          },
        },
      },
      athlete: {
        select: {
          id: true,
          fullName: true,
        },
      },
      coach: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  });

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Review not found');
  }

  return result;
};

const updateIntoDb = async (id: string, email: string, data: Partial<any>) => {
  // Find the review to check ownership
  const existingReview = await prisma.review.findUnique({
    where: { id },
    select: {
      id: true,
      athlete: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!existingReview) {
    throw new AppError(httpStatus.NOT_FOUND, 'Review not found');
  }

  if (existingReview.athlete.email !== email) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Unauthorized to update this review',
    );
  }
  const { rating, comment } = data;
  const result = await prisma.review.update({
    where: { id },
    data: {
      rating,
      comment,
    },
  });
  return result;
};

export const ReviewServices = {
  createIntoDb,
  getAllReview,
  getMyReview,
  getReviewByIdFromDB,
  updateIntoDb,
};
