import { BookingStatus, Prisma, SlotStatus } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { formatTimeWithAMPM } from '../Schedule/Schedule.constants';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';
import { Request } from 'express';
import { getWeeklySchedule } from './Coach.constant';

const getAllCoach = async (
  query: Record<string, any>,
  athleteEmail: string,
) => {
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

  if (searchTerm) {
    whereConditions.push({
      OR: [
        { fullName: { contains: searchTerm, mode: 'insensitive' } },
        { email: { equals: searchTerm, mode: 'insensitive' } },
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

  const favorite = await prisma.favorite.findMany({
    where: {
      athleteEmail: athleteEmail,
      isFavorite: true,
    },
  });
  const favoriteCoachEmails = favorite.map(f => f.coachEmail);

  // Fetch all coaches with necessary data
  const coaches = await prisma.coach.findMany({
    where: whereClause,
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
      availabilities: {
        select: {
          id: true,
          slotDate: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
      },
    },
  });

  // Calculate average rating for each coach
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
      isFavorite: favoriteCoachEmails.includes(coach.email),
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

const getCoachByIdFromDB = async (id: string, athleteMail: string) => {
  // Set today's date to midnight UTC
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const currentWindowStart = today;
  const currentWindowEnd = new Date(today);
  currentWindowEnd.setDate(today.getDate() + 7);
  currentWindowEnd.setUTCHours(0, 0, 0, 0);

  // ------------------------------------------

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

  const favoriteCoaches = await prisma.favorite.findMany({
    where: {
      athleteEmail: athleteMail,
    },
    select: {
      coachEmail: true,
    },
  });
  const favoriteCoachEmails = favoriteCoaches.map(fav => fav.coachEmail);
  const isFavorite = favoriteCoachEmails.includes(coach?.email as string);

  if (!coach) {
    return null;
  }
  // --- FILTERING FOR 7-DAY WINDOW ONLY ---
  const rollingWindowAvailabilities = coach.availabilities.filter(
    availability => {
      const slotDate = new Date(availability.slotDate);
      return slotDate >= currentWindowStart && slotDate < currentWindowEnd;
    },
  );

  // --- GENERATE WEEKLY SCHEDULE USING FILTERED DATA ---
  const projectedWeeklySchedule = getWeeklySchedule(
    rollingWindowAvailabilities,
  );

  const totalRating = coach.review.reduce(
    (sum, review) => sum + review.rating,
    0,
  );
  const avgRating =
    coach.review.length > 0 ? totalRating / coach.review.length : 0;

  const uniqueAthletes = await prisma.booking.groupBy({
    by: ['athleteId'],
    where: {
      coachId: coach.id,
      status: BookingStatus.CONFIRMED,
    },
  });
  const totalStudents = uniqueAthletes.length;

  return {
    ...coach,
    isFavorite,
    totalStudents,
    weeklySchedule: projectedWeeklySchedule,
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

  // Fetch coach with reviews upfront for consistent rating calculation
  const coach = await prisma.coach.findUnique({
    where: {
      id: coachId,
    },
    include: {
      specialty: {
        select: {
          title: true,
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
    throw new AppError(httpStatus.NOT_FOUND, 'Coach not found');
  }

  // Calculate rating from coach reviews (always available)
  const totalRating = coach.review.reduce(
    (sum, review) => sum + review.rating,
    0,
  );
  const avgRating =
    coach.review.length > 0 ? totalRating / coach.review.length : 0;

  const dateObj = new Date(slotDate as string);
  const availability = await prisma.coachAvailability.findUnique({
    where: {
      coachId_slotDate: {
        coachId: coach.id,
        slotDate: dateObj,
      },
    },
    include: {
      timeSlots: {
        where: { status: SlotStatus.ACTIVE },
        orderBy: {
          startTime: 'asc',
        },
      },
    },
  });

  // Dynamic nice message based on slots availability
  const totalSlots = availability?.timeSlots?.length ?? 0;
  const message =
    totalSlots > 0
      ? `Excellent! ${coach.fullName} has ${totalSlots} active slots available on ${slotDate}. Book your preferred time now!`
      : `Slots are available on ${slotDate}, but no active time slots at the moment. Check back later or contact the coach.`;
  return {
    coach: {
      id: coach.id,
      fullName: coach.fullName,
      profile: coach.profile,
      price: coach.price,
      experience: coach.experience,
      expertise: coach.expertise,
      specialty: coach?.specialty?.title || "Unknown",
    },
    rating: {
      avgRating: parseFloat(avgRating.toFixed(2)),
      totalReviews: coach.review.length,
    },
    message,
    date: slotDate,
    isActive: availability?.isActive ?? false,
    slots: availability?.timeSlots.map(slot => ({
      id: slot.id,
      startTime: formatTimeWithAMPM(slot.startTime),
      endTime: formatTimeWithAMPM(slot.endTime),
      status: slot.status,
      isBooked: slot.isBooked,
    })) ?? [],
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
