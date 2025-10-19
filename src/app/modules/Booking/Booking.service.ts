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
  // First, check if the user is an athlete or coach
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

  // Base where clause 
  const baseWhere = {
    status: {
      in: [
        BookingStatus.CONFIRMED,
        BookingStatus.RESCHEDULED_ACCEPTED,
        BookingStatus.FINISHED,
        BookingStatus.RESCHEDULE_REQUEST,
      ],
      // CANCELLED এবং RESCHEDULED_CANCELED 
    },
  };

  if (athlete) {
    // Get bookings for athlete
    bookings = await prisma.booking.findMany({
      where: {
        athleteId: athlete.id,
        ...baseWhere,
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
        createdAt: true,
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
        // Original booking info 
        rescheduledFrom: {
          select: {
            id: true,
            bookingDate: true,
            status: true,
            timeSlot: {
              select: {
                startTime: true,
                endTime: true,
              },
            },
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
        ...baseWhere,
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
        createdAt: true,
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
        rescheduledFrom: {
          select: {
            id: true,
            bookingDate: true,
            status: true,
            timeSlot: {
              select: {
                startTime: true,
                endTime: true,
              },
            },
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
const cancelBooking = async (
  userEmail: string,
  userRole: UserRoleEnum,
  bookingId: string,
) => {
  
  const user =
    userRole === UserRoleEnum.ATHLETE
      ? await prisma.athlete.findUnique({ where: { email: userEmail } })
      : await prisma.coach.findUnique({ where: { email: userEmail } });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

 
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
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
  });

  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  // Authorization check
  const isAthlete = userRole === UserRoleEnum.ATHLETE && booking.athleteId === user.id;
  const isCoach = userRole === UserRoleEnum.COACH && booking.coachId === user.id;

  if (!isAthlete && !isCoach) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not authorized to cancel this booking'
    );
  }

  if (booking.status === BookingStatus.CANCELLED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This booking is already cancelled');
  }

  if (booking.status === BookingStatus.FINISHED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Cannot cancel a finished booking');
  }


  const cancelledBooking = await prisma.$transaction(async (tx) => {

    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
      },
      select: {
        id: true,
        bookingDate: true,
        status: true,
        notes: true,
        updatedAt: true,
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
    });


    if (booking.timeSlotId) {
      await tx.timeSlot.update({
        where: { id: booking.timeSlotId },
        data: {
          isBooked: false,
        },
      });
    }

    return updated;
  });

  return cancelledBooking;
};

const finishBooking = async (
  userEmail: string,
  userRole: UserRoleEnum,
  bookingId: string,
) => {

  if (userRole !== UserRoleEnum.COACH) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Only coaches can mark bookings as finished'
    );
  }

 
  const coach = await prisma.coach.findUnique({
    where: { email: userEmail },
  });

  if (!coach) {
    throw new AppError(httpStatus.NOT_FOUND, 'Coach not found');
  }


  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
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
  });

  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found');
  }


  if (booking.coachId !== coach.id) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not authorized to finish this booking'
    );
  }


  if (booking.status === BookingStatus.FINISHED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This booking is already finished');
  }

  if (booking.status === BookingStatus.CANCELLED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Cannot finish a cancelled booking');
  }

  // if (![BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED_ACCEPTED].includes(booking.status)) {
  //   throw new AppError(
  //     httpStatus.BAD_REQUEST,
  //     'Only confirmed or rescheduled accepted bookings can be finished'
  //   );
  // }

  const currentDate = new Date();
  if (booking.bookingDate > currentDate) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Cannot finish a booking that has not occurred yet'
    );
  }


  const finishedBooking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.FINISHED,
    },
    select: {
      id: true,
      bookingDate: true,
      status: true,
      notes: true,
      updatedAt: true,
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
  });

  return finishedBooking;
};


// Reschedule Request
const requestReschedule = async (
  userEmail: string,
  userRole: UserRoleEnum,
  payload: {
    bookingId: string;
    newTimeSlotId: string;
    newBookingDate: string;
    notes?: string;
  },
) => {
  console.log(userEmail)
  const user =
    userRole === UserRoleEnum.ATHLETE
      ? await prisma.athlete.findUnique({ where: { email: userEmail } })
      : await prisma.coach.findUnique({ where: { email: userEmail } });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Original booking check 
  const originalBooking = await prisma.booking.findUnique({
    where: { id: payload.bookingId },
    include: {
      athlete: true,
      coach: true,
      timeSlot: {
        include: {
          availability: true,
        },
      },
    },
  });

  if (!originalBooking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Original booking not found');
  }

  const isAthlete =
    userRole === UserRoleEnum.ATHLETE && originalBooking.athleteId === user.id;
  const isCoach =
    userRole === UserRoleEnum.COACH && originalBooking.coachId === user.id;

  if (!isAthlete && !isCoach) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not authorized to reschedule this booking',
    );
  }

  // Check original booking already reschedule request cancelled/finished
  if (originalBooking.status === BookingStatus.RESCHEDULE_REQUEST) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This booking already has a pending reschedule request',
    );
  }

  // if (
  //   [BookingStatus.CANCELLED, BookingStatus.FINISHED].includes(
  //     originalBooking.status,
  //   )
  // ) {
  //   throw new AppError(
  //     httpStatus.BAD_REQUEST,
  //     'Cannot reschedule a cancelled or finished booking',
  //   );
  // }

  // New time slot check
  const newTimeSlot = await prisma.timeSlot.findUnique({
    where: { id: payload.newTimeSlotId },
    include: {
      availability: true,
    },
  });

  if (!newTimeSlot) {
    throw new AppError(httpStatus.NOT_FOUND, 'New time slot not found');
  }

  if (newTimeSlot.availability.coachId !== originalBooking.coachId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'New time slot must be from the same coach',
    );
  }

  const newBookingDate = new Date(payload.newBookingDate);

  const availabilityDate = new Date(newTimeSlot.availability.slotDate);
  availabilityDate.setHours(0, 0, 0, 0);
  const requestedDate = new Date(newBookingDate);
  requestedDate.setHours(0, 0, 0, 0);

  if (availabilityDate.getTime() !== requestedDate.getTime()) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Selected time slot does not belong to the requested date',
    );
  }

  const existingBooking = await prisma.booking.findFirst({
    where: {
      timeSlotId: payload.newTimeSlotId,
      bookingDate: newBookingDate,
      status: {
        in: [
          BookingStatus.CONFIRMED,
          BookingStatus.RESCHEDULE_REQUEST,
          BookingStatus.RESCHEDULED_ACCEPTED,
        ],
      },
    },
  });

  if (existingBooking) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This time slot is already booked for the selected date',
    );
  }

  // if (newBookingDate < new Date()) {
  //   throw new AppError(
  //     httpStatus.BAD_REQUEST,
  //     'Cannot reschedule to a past date',
  //   );
  // }

  // Transaction এ original booking update এবং new reschedule request create করা
  const result = await prisma.$transaction(async tx => {
    // New reschedule request booking create করা (status: RESCHEDULE_REQUEST)
    const rescheduleBooking = await tx.booking.create({
      data: {
        athleteId: originalBooking.athleteId,
        coachId: originalBooking.coachId,
        timeSlotId: payload.newTimeSlotId,
        bookingDate: newBookingDate,
        status: BookingStatus.RESCHEDULE_REQUEST,
        rescheduleFromId: payload.bookingId,
        notes:
          payload.notes || `Reschedule requested by ${userRole.toLowerCase()}`,
      },
      include: {
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
          include: {
            availability: true,
          },
        },
        rescheduledFrom: {
          include: {
            timeSlot: {
              include: {
                availability: true,
              },
            },
          },
        },
      },
    });

    return rescheduleBooking;
  });

  return result;
};

// Reschedule Request 
const respondToReschedule = async (
  userEmail: string,
  userRole: UserRoleEnum,
  payload: {
    rescheduleRequestId: string;
    status: 'RESCHEDULED_ACCEPTED' | 'RESCHEDULED_CANCELED';
  },
) => {
  
  const user =
    userRole === UserRoleEnum.ATHLETE
      ? await prisma.athlete.findUnique({ where: { email: userEmail } })
      : await prisma.coach.findUnique({ where: { email: userEmail } });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Reschedule request booking 
  const rescheduleRequest = await prisma.booking.findUnique({
    where: { id: payload.rescheduleRequestId },
    include: {
      athlete: true,
      coach: true,
      rescheduledFrom: {
        include: {
          timeSlot: {
            include: {
              availability: true,
            },
          },
        },
      },
      timeSlot: {
        include: {
          availability: true,
        },
      },
    },
  });

  if (!rescheduleRequest) {
    throw new AppError(httpStatus.NOT_FOUND, 'Reschedule request not found');
  }

  // Check করা এটা reschedule request কিনা
  if (rescheduleRequest.status !== BookingStatus.RESCHEDULE_REQUEST) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This is not a pending reschedule request',
    );
  }

  // Check করা user এই booking এর সাথে related কিনা
  const isAthlete =
    userRole === UserRoleEnum.ATHLETE &&
    rescheduleRequest.athleteId === user.id;
  const isCoach =
    userRole === UserRoleEnum.COACH && rescheduleRequest.coachId === user.id;

  if (!isAthlete && !isCoach) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not authorized to respond to this reschedule request',
    );
  }

  if (!rescheduleRequest.rescheduledFrom) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Original booking not found');
  }

  // status handle 
  if (payload.status === BookingStatus.RESCHEDULED_ACCEPTED) {
    // Accept করলে reschedule complete করা
    const result = await prisma.$transaction(async tx => {
      // Original booking cancel করা
      await tx.booking.update({
        where: { id: rescheduleRequest.rescheduleFromId! },
        data: {
          status: BookingStatus.CANCELLED,
        },
      });

      // New booking accept করা (status: RESCHEDULED_ACCEPTED)
      const acceptedBooking = await tx.booking.update({
        where: { id: payload.rescheduleRequestId },
        data: {
          status: BookingStatus.RESCHEDULED_ACCEPTED,
        },
        include: {
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
            include: {
              availability: true,
            },
          },
          rescheduledFrom: true,
        },
      });

      return acceptedBooking;
    });

    return result;
  } else if (payload.status === BookingStatus.RESCHEDULED_CANCELED) {
    // Cancel করলে reschedule request বাতিল (status: RESCHEDULED_CANCELED)
    const result = await prisma.$transaction(async tx => {
      // Reschedule request cancel করা
      await tx.booking.update({
        where: { id: payload.rescheduleRequestId },
        data: {
          status: BookingStatus.RESCHEDULED_CANCELED,
        },
      });

      // Original booking আগের মতোই থাকবে (CONFIRMED status এ)
      const originalBooking = await tx.booking.findUnique({
        where: { id: rescheduleRequest.rescheduleFromId! },
        include: {
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
            include: {
              availability: true,
            },
          },
        },
      });

      return {
        canceledRequest: await tx.booking.findUnique({
          where: { id: payload.rescheduleRequestId },
          include: {
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
              include: {
                availability: true,
              },
            },
          },
        }),
        originalBooking,
      };
    });

    return result;
  } else {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid action provided');
  }
};

// Get Pending Reschedule Requests
const getPendingRescheduleRequests = async (
  userEmail: string,
  userRole: UserRoleEnum,
) => {

  const user =
    userRole === UserRoleEnum.ATHLETE
      ? await prisma.athlete.findUnique({ where: { email: userEmail } })
      : await prisma.coach.findUnique({ where: { email: userEmail } });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const whereClause: any = {
    status: BookingStatus.RESCHEDULE_REQUEST,
  };

  if (userRole === UserRoleEnum.ATHLETE) {
    whereClause.athleteId = user.id;
  } else if (userRole === UserRoleEnum.COACH) {
    whereClause.coachId = user.id;
  }

  const requests = await prisma.booking.findMany({
    where: whereClause,
    select: {
      id: true,
      bookingDate: true,
      status: true,
      notes: true,
      createdAt: true,
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
      rescheduledFrom: {
        select: {
          id: true,
          bookingDate: true,
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
    orderBy: {
      createdAt: 'desc',
    },
  });
  return requests;
};


export const BookingServices = {
  createIntoDb,
  getAllBooking,
  getMyBooking,
  getPendingRescheduleRequests,
  respondToReschedule,
  requestReschedule,
  cancelBooking,
  finishBooking,
};
