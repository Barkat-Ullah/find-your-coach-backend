import {
  BookingStatus,
  GenderEnum,
  Prisma,
  SlotStatus,
  UserRoleEnum,
} from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { formatTimeWithAMPM } from '../Schedule/Schedule.constants';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';
import { Request } from 'express';

const getAllCoach = async (query: Record<string, any>) => {
  const {
    searchTerm,
    rating,
    experience,
    minPrice,
    maxPrice,
    gender,
    location,
    page = 1,
    limit = 10,
  } = query;

  // Fetch all valid specialty IDs to ensure data consistency
  const specialties = await prisma.specialties.findMany({
    select: { id: true },
  });
  const validSpecialtyIds = specialties.map(s => s.id);

  const whereConditions: Prisma.CoachWhereInput[] = [
    { specialtyId: { in: validSpecialtyIds } },
  ];

  // Search functionality (name, email, address, specialty title)
  if (searchTerm) {
    whereConditions.push({
      OR: [
        { fullName: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
        { address: { contains: searchTerm, mode: 'insensitive' } },
        {
          specialty: {
            title: { contains: searchTerm, mode: 'insensitive' },
          },
        },
      ],
    });
  }

  // Experience filter
  if (experience) {
    whereConditions.push({
      experience: parseInt(experience),
    });
  }

  // Price range filter
  if (minPrice || maxPrice) {
    const priceFilter: any = {};
    if (minPrice) priceFilter.gte = parseFloat(minPrice);
    if (maxPrice) priceFilter.lte = parseFloat(maxPrice);
    whereConditions.push({
      price: priceFilter,
    });
  }

  // Gender filter
  if (gender) {
    whereConditions.push({
      gender: gender,
    });
  }

  // Location filter
  if (location) {
    whereConditions.push({
      location: { contains: location, mode: 'insensitive' },
    });
  }

  const whereClause: Prisma.CoachWhereInput = { AND: whereConditions };

  // Fetch all coaches with necessary data
  const coaches = await prisma.coach.findMany({
    where: whereClause,
    include: {
      specialty: {
        select: {
          id: true,
          title: true,
        },
      },
      review: {
        select: {
          rating: true,
        },
      },
      subscription: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  // Calculate average rating for each coach and add it to coach object
  const coachesWithRating = coaches.map(coach => {
    const totalRating = coach.review.reduce(
      (sum, review) => sum + review.rating,
      0,
    );
    const avgRating =
      coach.review.length > 0 ? totalRating / coach.review.length : 0;

    return {
      ...coach,
      avgRating: parseFloat(avgRating.toFixed(2)),
      totalReviews: coach.review.length,
    };
  });

  // Filter by rating if specified
  let filteredCoaches = coachesWithRating;
  if (rating) {
    const minRating = parseFloat(rating);
    filteredCoaches = coachesWithRating.filter(
      coach => coach.avgRating >= minRating,
    );
  }

  // Separate coaches into three groups
  const recommendedCoaches: any[] = [];
  const subscribedCoaches: any[] = [];
  const regularCoaches: any[] = [];

  filteredCoaches.forEach(coach => {
    if (coach.isRecommendedPayment) {
      recommendedCoaches.push(coach);
    } else if (coach.subscription) {
      subscribedCoaches.push(coach);
    } else {
      regularCoaches.push(coach);
    }
  });

  // Sort each group by rating (highest first)
  const sortByRating = (a: any, b: any) => b.avgRating - a.avgRating;

  recommendedCoaches.sort(sortByRating);
  subscribedCoaches.sort(sortByRating);
  regularCoaches.sort(sortByRating);

  // Combine all groups in order: recommended → subscribed → regular
  const sortedCoaches = [
    ...recommendedCoaches,
    ...subscribedCoaches,
    ...regularCoaches,
  ];

  // Pagination
  const skip = (Number(page) - 1) * Number(limit);
  const paginatedCoaches = sortedCoaches.slice(skip, skip + Number(limit));

  // Remove review array from response, keep only avgRating and totalReviews
  const finalCoaches = paginatedCoaches.map(coach => {
    const { review, ...coachData } = coach;
    return coachData;
  });

  return {
    meta: {
      page: Number(page),
      limit: Number(limit),
      total: sortedCoaches.length,
    },
    data: finalCoaches,
  };
};

const getCoachByIdFromDB = async (id: string) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const coach = await prisma.coach.findUnique({
    where: { id },
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
      latitude: true,
      longitude: true,
      address: true,
      price: true,
      gender: true,
      age: true,
      isRecommendedPayment: true,
      recommendedTime: true,
      specialtyId: true,
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
      availabilities: {
        select: {
          id: true,
          slotDate: true,
          startTime: true,
          endTime: true,
          isActive: true,
          // timeSlots:true
        },
        where: {
          isActive: true,
          slotDate: { gte: today },
        },
        orderBy: {
          slotDate: 'asc',
        },
      },
      review: {
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          athlete: {
            select: {
              id: true,
              fullName: true,
              profile: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  });

  if (!coach) {
    return null;
  }

  const filteredAvailabilities = coach.availabilities.slice(0, 5);

  const formattedAvailabilities = filteredAvailabilities.map(availability => ({
    id: availability.id,
    slotDate: availability.slotDate,
    startTime: formatTimeWithAMPM(availability.startTime),
    endTime: formatTimeWithAMPM(availability.endTime),
    isActive: availability.isActive,
    // timeSlots:availability.timeSlots
  }));

  // Calculate average rating
  const totalRating = coach.review.reduce(
    (sum, review) => sum + review.rating,
    0,
  );
  const avgRating =
    coach.review.length > 0 ? totalRating / coach.review.length : 0;

  return {
    ...coach,
    availabilities: formattedAvailabilities,
    avgRating: parseFloat(avgRating.toFixed(2)),
    totalReviews: coach.review.length,
  };
};

const getMyCoachAndAthlete = async (email: string) => {
  // Check if user is athlete
  const athlete = await prisma.athlete.findUnique({
    where: { email },
    select: {
      id: true,
      fullName: true,
      profile: true,
      email: true,
      phoneNumber: true,
    },
  });

  if (athlete) {
    // Athlete: Fetch their active/recent coaches from bookings
    const bookings = await prisma.booking.findMany({
      where: {
        athleteId: athlete.id,
        status: {
          in: [
            BookingStatus.CONFIRMED,
            BookingStatus.RESCHEDULED_ACCEPTED,
            BookingStatus.FINISHED,
          ],
        },
      },
      select: {
        id: true,
        bookingDate: true,
        status: true,
        coach: {
          select: {
            id: true,
            fullName: true,
            email: true,
            profile: true,
            phoneNumber: true,
            location: true,
            expertise: true,
            price: true,
            gender: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    // Extract unique coaches (if multiple bookings with same coach)
    const coaches = bookings
      .map(booking => booking.coach)
      .filter(
        (coach, index, self) =>
          self.findIndex(c => c.id === coach.id) === index,
      );

    return {
      data: coaches,
      message: `Found ${coaches.length} coach(es) for athlete ${athlete.fullName}`,
    };
  }

  // Check if user is coach
  const coach = await prisma.coach.findUnique({
    where: { email },
    select: {
      id: true,
      fullName: true,
      profile: true,
      email: true,
      phoneNumber: true,
      location: true,
      expertise: true,
      price: true,
      gender: true,
    },
  });

  if (!coach) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'User not found as athlete or coach',
    );
  }

  // Coach: Fetch their active/recent athletes from bookings
  const bookings = await prisma.booking.findMany({
    where: {
      coachId: coach.id,
      status: {
        in: [
          BookingStatus.CONFIRMED,
          BookingStatus.RESCHEDULED_ACCEPTED,
          BookingStatus.FINISHED,
        ],
      },
    },
    select: {
      id: true,
      bookingDate: true,
      status: true,
      athlete: {
        select: {
          id: true,
          fullName: true,
          profile: true,
          email: true,
          phoneNumber: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  // Extract unique athletes
  const athletes = bookings
    .map(booking => booking.athlete)
    .filter(
      (athlete, index, self) =>
        self.findIndex(a => a.id === athlete.id) === index,
    );

  return {
    data: athletes,
    message: `Found ${athletes.length} athlete(s) for coach ${coach.fullName}`,
  };
};

const getSpecifiCoaches = async (req: Request) => {
  const { slotDate } = req.query;
  const { coachId } = req.params;

  const coach = await prisma.coach.findUnique({
    where: {
      id: coachId,
    },
  });
  if (!coach) {
    throw new AppError(httpStatus.NOT_FOUND, 'Coach not found');
  }

  const dateObj = new Date(slotDate as string);
  const availability = await prisma.coachAvailability.findUnique({
    where: {
      coachId_slotDate: {
        coachId: coach.id,
        slotDate: dateObj,
      },
    },
    include: {
      coach: { select: { id: true, fullName: true } },
      timeSlots: {
        where: { status: SlotStatus.ACTIVE },
        orderBy: {
          startTime: 'asc',
        },
      },
    },
  });

  if (!availability) {
    return {
      message: 'No slots found for this date',
      slots: [],
    };
  }

  return {
    date: slotDate,
    isActive: availability.isActive,
    availabilityTime: {
      coachId: availability.coach.id,
      coachName: availability.coach.fullName,
      startTime: formatTimeWithAMPM(availability.startTime),
      endTime: formatTimeWithAMPM(availability.endTime),
    },
    slots: availability.timeSlots.map(slot => ({
      id: slot.id,
      startTime: formatTimeWithAMPM(slot.startTime), // "10:00 AM"
      endTime: formatTimeWithAMPM(slot.endTime), // "11:00 AM"
      status: slot.status,
      isBooked: slot.isBooked,
    })),
  };
};

const updateIntoDb = async (id: string, data: Partial<any>) => {
  console.dir({ id, data });
  return null;
};

export const CoachServices = {
  getAllCoach,
  getMyCoachAndAthlete,
  getSpecifiCoaches,
  getCoachByIdFromDB,
  updateIntoDb,
};
