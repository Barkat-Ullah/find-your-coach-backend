import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { formatTimeWithAMPM } from '../Schedule/Schedule.constants';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';

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
      experience: experience,
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

const getMyCoachAndAthlete = async (email: string) => {
  console.log('Fetching my Coach for user:', email);
  const athlete = await prisma.athlete.findUnique({
    where: { email },
  });

  const coach = await prisma.coach.findUnique({
    where: { email },
  });

  if (!athlete || !coach) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }
};

const getCoachByIdFromDB = async (id: string) => {
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
          // dayOfWeek: true,
          slotDate: true,
          startTime: true,
          endTime: true,
          isActive: true,
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

  const formattedAvailabilities = coach.availabilities.map(availability => ({
    id: availability.id,
    slotDate: availability.slotDate,
    startTime: formatTimeWithAMPM(availability.startTime),
    endTime: formatTimeWithAMPM(availability.endTime),
    isActive: availability.isActive,
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

const updateIntoDb = async (id: string, data: Partial<any>) => {
  console.dir({ id, data });
  return null;
};

export const CoachServices = {
  getAllCoach,
  getMyCoachAndAthlete,
  getCoachByIdFromDB,
  updateIntoDb,
};
