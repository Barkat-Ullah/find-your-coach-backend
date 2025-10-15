import { Request } from 'express';
import { PrismaClient, BookingStatus, UserRoleEnum } from '@prisma/client';
import httpStatus from 'http-status';
import AppError from '../../errors/AppError';

const prisma = new PrismaClient();

const createIntoDb = async (req: Request) => {
  const athleteEmail = req.user.email;
  const { coachId, timeSlotId, bookingDate, notes } = req.body;

  // Validate required fields
  if (!coachId || !timeSlotId || !bookingDate) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: coachId, timeSlotId, bookingDate',
    );
  }

  // Start a transaction to ensure atomicity
  return await prisma.$transaction(async tx => {
    // 1. Get athlete by email
    const athlete = await tx.athlete.findUnique({
      where: { email: athleteEmail },
    });

    if (!athlete) {
      throw new AppError(httpStatus.NOT_FOUND, 'Athlete not found');
    }

    // 2. Check if the time slot exists
    const timeSlot = await tx.timeSlot.findUnique({
      where: { id: timeSlotId },
      include: { availability: true },
    });

    if (!timeSlot) {
      throw new AppError(httpStatus.NOT_FOUND, 'Time slot not found');
    }

    // 3. Verify the coach owns this time slot
    if (timeSlot.availability.coachId !== coachId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Time slot does not belong to this coach',
      );
    }

    // 4. Check if the slot is active
    if (timeSlot.status !== 'ACTIVE') {
      throw new AppError(httpStatus.BAD_REQUEST, 'Time slot is not active');
    }

    // 5. Verify booking date matches the availability date
    const bookingDateOnly = new Date(bookingDate);
    bookingDateOnly.setHours(0, 0, 0, 0);

    const availabilityDateOnly = new Date(timeSlot.availability.slotDate);
    availabilityDateOnly.setHours(0, 0, 0, 0);

    if (bookingDateOnly.getTime() !== availabilityDateOnly.getTime()) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Booking date does not match time slot availability date',
      );
    }

    // 6. Check if the date is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (bookingDateOnly < today) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Cannot book time slots in the past',
      );
    }

    // 7. Check if the time slot is already booked for this specific date
    const existingBooking = await tx.booking.findFirst({
      where: {
        timeSlotId,
        bookingDate: {
          gte: bookingDateOnly,
          lt: new Date(bookingDateOnly.getTime() + 24 * 60 * 60 * 1000),
        },
        status: {
          in: ['CONFIRMED', 'RESCHEDULE_REQUEST', 'RESCHEDULED_ACCEPTED'],
        },
      },
    });

    if (existingBooking) {
      throw new AppError(
        httpStatus.CONFLICT,
        'This time slot is already booked for the selected date',
      );
    }

    // 8. Verify coach exists
    const coach = await tx.coach.findUnique({ where: { id: coachId } });

    if (!coach) {
      throw new AppError(httpStatus.NOT_FOUND, 'Coach not found');
    }

    // 9. Create the booking with the exact slot time
    const slotStartTime = new Date(timeSlot.startTime);
    const bookingDateTime = new Date(bookingDate);
    bookingDateTime.setHours(
      slotStartTime.getHours(),
      slotStartTime.getMinutes(),
      slotStartTime.getSeconds(),
      0,
    );

    const booking = await tx.booking.create({
      data: {
        athleteId: athlete.id,
        coachId,
        timeSlotId,
        bookingDate: bookingDateTime,
        status: BookingStatus.CONFIRMED,
        notes,
      },
      include: {
        athlete: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            profile: true,
            email: true,
          },
        },
        coach: {
          select: {
            id: true,
            email: true,
            fullName: true,
            phoneNumber: true,
            profile: true,
            specialty: true,
            experience: true,
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
    });

    // 10. Update the time slot's isBooked flag (for template reference)
    await tx.timeSlot.update({
      where: { id: timeSlotId },
      data: { isBooked: true },
    });

    return booking;
  });
};

const getAllBooking = async (query: Record<string, any>) => {
  const {
    page = 1,
    limit = 10,
    sortBy = 'bookingDate',
    sortOrder = 'asc',
    status,
    coachId,
    athleteId,
    fromDate,
    toDate,
  } = query;

  // Build where clause
  const whereClause: any = {};

  if (status) {
    whereClause.status = status;
  }

  if (coachId) {
    whereClause.coachId = coachId;
  }

  if (athleteId) {
    whereClause.athleteId = athleteId;
  }

  if (fromDate || toDate) {
    whereClause.bookingDate = {};
    if (fromDate) {
      whereClause.bookingDate.gte = new Date(fromDate);
    }
    if (toDate) {
      whereClause.bookingDate.lte = new Date(toDate);
    }
  }

  // Calculate pagination
  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  // Fetch bookings with pagination
  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where: whereClause,
      skip,
      take,
      orderBy: {
        [sortBy]: sortOrder,
      },
      include: {
        athlete: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            profile: true,
            email: true,
          },
        },
        coach: {
          select: {
            id: true,
            email: true,
            fullName: true,
            phoneNumber: true,
            profile: true,
            specialty: true,
            experience: true,
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
    }),
    prisma.booking.count({ where: whereClause }),
  ]);

  return {
    data: bookings,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
};

const getMyBooking = async (email: string) => {
  // First, determine if the user is an athlete or coach
  const athlete = await prisma.athlete.findUnique({
    where: { email },
  });

  const coach = await prisma.coach.findUnique({
    where: { email },
  });

  if (!athlete && !coach) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  let bookings;

  if (athlete) {
    // Get bookings for athlete
    bookings = await prisma.booking.findMany({
      where: {
        athleteId: athlete.id,
      },
      select: {
        id: true,
        athleteId: true,
        coachId: true,
        timeSlotId: true,
        bookingDate: true,
        status: true,
        rescheduleFromId: true,
        notes: true,
        coach: {
          select: {
            id: true,
            email: true,
            fullName: true,
            phoneNumber: true,
            profile: true,
            specialty: {
              select: {
                id: true,
                title: true,
                icon: true,
              },
            },
            experience: true,
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
      orderBy: {
        bookingDate: 'desc',
      },
    });
  } else if (coach) {
    // Get bookings for coach
    bookings = await prisma.booking.findMany({
      where: {
        coachId: coach.id,
      },
      select: {
        id: true,
        athleteId: true,
        coachId: true,
        timeSlotId: true,
        bookingDate: true,
        status: true,
        rescheduleFromId: true,
        notes: true,
        athlete: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            profile: true,
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
      orderBy: {
        bookingDate: 'desc',
      },
    });
  }

  return bookings;
};

export const BookingServices = {
  createIntoDb,
  getAllBooking,
  getMyBooking,
};
