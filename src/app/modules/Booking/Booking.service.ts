import { Request } from 'express';
import { PrismaClient, BookingStatus, UserRoleEnum } from '@prisma/client';
import httpStatus from 'http-status';
import AppError from '../../errors/AppError';
import { createNotification } from '../../middlewares/notify';

const prisma = new PrismaClient();

const createIntoDb = async (req: Request) => {
  const athleteEmail = req.user.email;
  const { coachId, timeSlotId, bookingDate, notes, locationName, lon, lat } =
    req.body;

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
      include: { user: true },
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
    const coach = await tx.coach.findUnique({
      where: { id: coachId },
      include: { user: true },
    });

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
        lat,
        lon,
        locationName,
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

    // 10. Update the time slot's isBooked flag
    await tx.timeSlot.update({
      where: { id: timeSlotId },
      data: { isBooked: true },
    });

    // ✅ NOTIFICATION #1: NEW BOOKING CREATED
    // Send notification to coach when athlete creates a booking
    await createNotification({
      receiverId: coach.user.id, // Coach receives the notification
      senderId: athlete.user.id, // Athlete is the sender
      title: 'New Booking Received',
      body: `${athlete.fullName} has booked a session with you on ${bookingDateTime.toLocaleDateString()} at ${slotStartTime.toLocaleTimeString()}`,
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
        // BookingStatus.RESCHEDULE_REQUEST,
      ],
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
        lat: true,
        lon: true,
        locationName: true,
        createdAt: true,
        coach: {
          select: {
            id: true,
            email: true,
            fullName: true,
            phoneNumber: true,
            profile: true,
            price: true,
            specialty: {
              select: {
                title: true,
              },
            },
            experience: true,
            review: {
              select: {
                rating: true,
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

    // Calculate avgRating for each coach in bookings
    bookings = bookings.map(booking => {
      const coach = booking.coach;
      const reviews = coach.review ?? [];
      const totalRating = reviews.reduce(
        (sum, review) => sum + review.rating,
        0,
      );
      const avgRating =
        coach.review.length > 0 ? totalRating / coach.review.length : 0;

      return {
        ...booking,
        coach: {
          ...coach,
          avgRating,
          review: undefined,
        },
      };
    });
  } else if (coach) {
    // Get bookings for coach (unchanged, unless you want athlete ratings too)
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
        lat: true,
        lon: true,
        locationName: true,
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

const getMyFinishedBooking = async (email: string, status?: string) => {
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
  const baseWhere: any = {};
  if (status) {
    // If status is provided, filter by that specific status
    baseWhere.status = status as BookingStatus;
  } else {
    // If no status provided, show all finished/cancelled/rescheduled bookings
    baseWhere.status = {
      in: [
        BookingStatus.FINISHED,
        BookingStatus.CANCELLED,
        BookingStatus.RESCHEDULED_ACCEPTED,
      ],
    };
  }

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
        lat: true,
        lon: true,
        locationName: true,
        createdAt: true,
        coach: {
          select: {
            id: true,
            email: true,
            fullName: true,
            phoneNumber: true,
            profile: true,
            price: true,
            specialty: {
              select: {
                id: true,
                title: true,
                icon: true,
              },
            },
            review: {
              select: {
                rating: true,
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

    // Calculate avgRating for each coach in bookings
    bookings = bookings.map(booking => {
      const coach = booking?.coach;
      const reviews = coach.review ?? [];
      const totalRating = reviews.reduce(
        (sum, review) => sum + review.rating,
        0,
      );
      const avgRating =
        coach.review.length > 0 ? totalRating / coach.review.length : 0;

      return {
        ...booking,
        coach: {
          ...coach,
          avgRating,
          review: undefined,
        },
      };
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
        coach: {
          select: {
            price: true,
          },
        },
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
      ? await prisma.athlete.findUnique({
          where: { email: userEmail },
          include: { user: true },
        })
      : await prisma.coach.findUnique({
          where: { email: userEmail },
          include: { user: true },
        });

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
          profile: true,
          user: true,
        },
      },
      coach: {
        select: {
          id: true,
          fullName: true,
          email: true,
          profile: true,
          price: true,
          user: true,
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
  const isAthlete =
    userRole === UserRoleEnum.ATHLETE && booking.athleteId === user.id;
  const isCoach =
    userRole === UserRoleEnum.COACH && booking.coachId === user.id;

  if (!isAthlete && !isCoach) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not authorized to cancel this booking',
    );
  }

  if (booking.status === BookingStatus.CANCELLED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This booking is already cancelled',
    );
  }

  if (booking.status === BookingStatus.FINISHED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Cannot cancel a finished booking',
    );
  }

  const cancelledBooking = await prisma.$transaction(async tx => {
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

    //  ✅  NOTIFICATION #2: BOOKING CANCELLED
    //  Send notification to the other party (coach or athlete)
    //  Determine receiver and sender based on who cancelled
    // const receiverId = isAthlete
    //   ? booking.coach.user.id // If athlete cancelled, notify coach
    //   : booking.athlete.user.id; // If coach cancelled, notify athlete

    // const senderName = isAthlete
    //   ? booking.athlete.fullName
    //   : booking.coach.fullName;

    // await createNotification({
    //   receiverId, // The other party receives the notification
    //   senderId: user.user.id, // The canceller is the sender
    //   title: 'Booking Cancelled',
    //   body: `${senderName} has cancelled the booking scheduled for ${booking.bookingDate.toLocaleDateString()}`,
    // });

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
      'Only coaches can mark bookings as finished',
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
          profile: true,
        },
      },
      coach: {
        select: {
          id: true,
          fullName: true,
          email: true,
          profile: true,
          price: true,
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
      'You are not authorized to finish this booking',
    );
  }

  if (booking.status === BookingStatus.FINISHED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This booking is already finished',
    );
  }

  if (booking.status === BookingStatus.CANCELLED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Cannot finish a cancelled booking',
    );
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
      'Cannot finish a booking that has not occurred yet',
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
          profile: true,
        },
      },
      coach: {
        select: {
          id: true,
          fullName: true,
          email: true,
          profile: true,
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
  // console.log(userEmail);
  const user =
    userRole === UserRoleEnum.ATHLETE
      ? await prisma.athlete.findUnique({
          where: { email: userEmail },
          include: { user: true },
        })
      : await prisma.coach.findUnique({
          where: { email: userEmail },
          include: { user: true },
        });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Original booking check
  const originalBooking = await prisma.booking.findUnique({
    where: { id: payload.bookingId },
    include: {
      athlete: {
        include: {
          user: true,
        },
      },
      coach: {
        include: {
          user: true,
        },
      },
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

  const result = await prisma.$transaction(async tx => {
    // New reschedule request booking create
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
            profile: true,
          },
        },
        coach: {
          select: {
            id: true,
            fullName: true,
            email: true,
            profile: true,
            price: true,
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

    // ✅ NOTIFICATION #4: RESCHEDULE REQUEST
    // Send notification to the other party when reschedule is requested
    // Determine receiver based on who requested the reschedule
    // const receiverId = isAthlete
    //   ? originalBooking.coach.user.id // If athlete requested, notify coach
    //   : originalBooking.athlete.user.id; // If coach requested, notify athlete

    // const senderName = isAthlete
    //   ? originalBooking.athlete.fullName
    //   : originalBooking.coach.fullName;

    // await createNotification({
    //   receiverId, // The other party receives the notification
    //   senderId: user.user.id, // The requester is the sender
    //   title: 'Reschedule Request',
    //   body: `${senderName} has requested to reschedule the booking to ${newBookingDate.toLocaleDateString()} at ${new Date(newTimeSlot.startTime).toLocaleTimeString()}`,
    // });

    return rescheduleBooking;
  });

  return result;
};

// Reschedule Request
const respondToReschedule = async (
  userEmail: string,
  userRole: UserRoleEnum,
  payload: {
    rescheduleFromId: string;
    status: 'RESCHEDULED_ACCEPTED' | 'RESCHEDULED_CANCELED';
  },
) => {
  const user =
    userRole === UserRoleEnum.ATHLETE
      ? await prisma.athlete.findUnique({
          where: { email: userEmail },
          include: { user: true },
        })
      : await prisma.coach.findUnique({
          where: { email: userEmail },
          include: { user: true },
        });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Reschedule request booking
  const rescheduleRequest = await prisma.booking.findUnique({
    where: { id: payload.rescheduleFromId },
    include: {
      athlete: {
        include: { user: true },
      },
      coach: {
        include: { user: true },
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

  if (rescheduleRequest.status !== BookingStatus.RESCHEDULE_REQUEST) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This is not a pending reschedule request',
    );
  }

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
    const result = await prisma.$transaction(async tx => {
      // Original booking cancel
      await tx.booking.update({
        where: { id: rescheduleRequest.rescheduleFromId! },
        data: {
          status: BookingStatus.CANCELLED,
        },
      });

      // New booking accept
      const acceptedBooking = await tx.booking.update({
        where: { id: payload.rescheduleFromId },
        data: {
          status: BookingStatus.RESCHEDULED_ACCEPTED,
        },
        include: {
          athlete: {
            select: {
              id: true,
              fullName: true,
              email: true,
              profile: true,
            },
          },
          coach: {
            select: {
              id: true,
              fullName: true,
              email: true,
              profile: true,
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

      // ✅ NOTIFICATION #5: RESCHEDULE REQUEST ACCEPTED
      // Send notification to the requester when reschedule is accepted
      // The person who requested the reschedule receives the notification
      // Note: We need to determine who REQUESTED the reschedule (opposite of who ACCEPTED)
      // Since we're in the respondToReschedule, the current user is accepting
      // So the receiver is the opposite party
      // const receiverId = isAthlete
      //   ? rescheduleRequest.coach.user.id // If athlete accepted, notify coach (coach requested)
      //   : rescheduleRequest.athlete.user.id; // If coach accepted, notify athlete (athlete requested)

      // const responderName = isAthlete
      //   ? rescheduleRequest.athlete.fullName
      //   : rescheduleRequest.coach.fullName;

      // await createNotification({
      //   receiverId, // The requester receives the notification
      //   senderId: user.user.id, // The person who accepted is the sender
      //   title: 'Reschedule Request Accepted',
      //   body: `${responderName} has accepted your reschedule request for ${rescheduleRequest.bookingDate.toLocaleDateString()}`,
      // });

      return acceptedBooking;
    });

    return result;
  } else if (payload.status === BookingStatus.RESCHEDULED_CANCELED) {
    const result = await prisma.$transaction(async tx => {
      // Reschedule request cancel
      await tx.booking.update({
        where: { id: payload.rescheduleFromId },
        data: {
          status: BookingStatus.RESCHEDULED_CANCELED,
        },
      });

      // Original booking
      const originalBooking = await tx.booking.findUnique({
        where: { id: rescheduleRequest.rescheduleFromId! },
        include: {
          athlete: {
            select: {
              id: true,
              fullName: true,
              email: true,
              profile: true,
            },
          },
          coach: {
            select: {
              id: true,
              fullName: true,
              email: true,
              price: true,
              profile: true,
            },
          },
          timeSlot: {
            include: {
              availability: true,
            },
          },
        },
      });

      // ✅  NOTIFICATION #6: RESCHEDULE REQUEST REJECTED
      // Send notification to the requester when reschedule is rejected
      // Similar logic to acceptance - receiver is the opposite party
      // const receiverId = isAthlete
      //   ? rescheduleRequest.coach.user.id // If athlete rejected, notify coach (coach requested)
      //   : rescheduleRequest.athlete.user.id; // If coach rejected, notify athlete (athlete requested)

      // const responderName = isAthlete
      //   ? rescheduleRequest.athlete.fullName
      //   : rescheduleRequest.coach.fullName;

      // await createNotification({
      //   receiverId, // The requester receives the notification
      //   senderId: user.user.id, // The person who rejected is the sender
      //   title: 'Reschedule Request Rejected',
      //   body: `${responderName} has rejected your reschedule request. The original booking remains active.`,
      // });

      return {
        canceledRequest: await tx.booking.findUnique({
          where: { id: payload.rescheduleFromId },
          include: {
            athlete: {
              select: {
                id: true,
                fullName: true,
                email: true,
                profile: true,
              },
            },
            coach: {
              select: {
                id: true,
                fullName: true,
                email: true,
                price: true,
                profile: true,
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
      lat: true,
      lon: true,
      locationName: true,
      createdAt: true,
      athlete: {
        select: {
          id: true,
          fullName: true,
          email: true,
          profile: true,
        },
      },
      coach: {
        select: {
          id: true,
          fullName: true,
          email: true,
          price: true,
          profile: true,
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
  getMyFinishedBooking,
  getPendingRescheduleRequests,
  respondToReschedule,
  requestReschedule,
  cancelBooking,
  finishBooking,
};
