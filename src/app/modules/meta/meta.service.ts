import { Request } from 'express';
import { prisma } from '../../utils/prisma';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';
import { BookingStatus } from '@prisma/client';
import { getDateRange } from './dateHelpers';

interface MonthlyData {
  labels: string[];
  athletes: number[];
  coaches: number[];
}

const getDashboardData = async (adminId: string) => {
  const admin = await prisma.user.findUnique({
    where: {
      id: adminId,
    },
  });
  if (!admin) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized');
  }
  //show all data
  //1
  const totalAthletes = await prisma.athlete.count();
  //2
  const totalCoaches = await prisma.coach.count();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  //3
  const activeBookings = await prisma.booking.count({
    where: {
      status: {
        in: ['CONFIRMED', 'RESCHEDULE_REQUEST', 'RESCHEDULED_ACCEPTED'],
      },
      createdAt: {
        gte: oneWeekAgo,
      },
    },
  });
  const totalRevenue = await prisma.payment.aggregate({
    _sum: {
      amount: true,
    },
  });
  //4
  const totalRevenueAmount = totalRevenue._sum.amount || 0;

  //5 Popular Sports (top 4 by coach count per specialty)
  const sportGroups = await prisma.coach.groupBy({
    by: ['specialtyId'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 4,
  });
  const specIds = sportGroups.map(g => g.specialtyId);
  const specialties = await prisma.specialties.findMany({
    where: { id: { in: specIds } },
    select: { id: true, title: true, icon: true },
  });
  const specMap = new Map(
    specialties.map(s => [s.id, { title: s.title, icon: s.icon }]),
  );
  const popularSports = sportGroups.map(g => {
    const spec = specMap.get(g.specialtyId);
    return {
      name: spec?.title || 'Unknown',
      icon: spec?.icon || null,
      count: g._count.id,
    };
  });

  return {
    totalAthletes,
    totalCoaches,
    activeBookings,
    totalRevenue: totalRevenueAmount,
    popularSports,
  };
};

const getUserStats = async (period: string = 'monthly') => {
  if (period && typeof period !== 'string') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Period must be a string');
  }

  const { start: currentStart, end: currentEnd } = getDateRange(period);
  const { start: prevStart, end: prevEnd } = getDateRange(period, 1);

  const [athletes, coaches] = await Promise.all([
    prisma.athlete.count({
      where: { createdAt: { gte: currentStart, lte: currentEnd } },
    }),
    prisma.coach.count({
      where: { createdAt: { gte: currentStart, lte: currentEnd } },
    }),
  ]);
  const newJoiners = athletes + coaches;

  const [oldAthletes, oldCoaches] = await Promise.all([
    prisma.athlete.count({
      where: { createdAt: { gte: prevStart, lte: prevEnd } },
    }),
    prisma.coach.count({
      where: { createdAt: { gte: prevStart, lte: prevEnd } },
    }),
  ]);
  const oldJoiners = oldAthletes + oldCoaches;

  let growthRate = 0;

  if (oldJoiners >= 5) {
    growthRate = ((newJoiners - oldJoiners) / oldJoiners) * 100;
  } else if (oldJoiners > 0 && oldJoiners < 5) {
    growthRate = ((newJoiners - oldJoiners) / 5) * 100;
  }

  if (growthRate > 300) growthRate = 300;
  if (growthRate < -100) growthRate = -100;

  const userGrowth = Math.round(growthRate);
  const userGrowthPercent =
    userGrowth >= 0 ? `+${userGrowth}%` : `${userGrowth}%`;

  //*monthly data
  let monthlyData: MonthlyData = { labels: [], athletes: [], coaches: [] };
  if (period === 'monthly' || period === 'yearly') {
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const monthlyAthletes = await prisma.athlete.groupBy({
      by: ['createdAt'],
      _count: { id: true },
      where: { createdAt: { gte: oneYearAgo } },
      orderBy: { createdAt: 'asc' },
    });
    const monthlyCoaches = await prisma.coach.groupBy({
      by: ['createdAt'],
      _count: { id: true },
      where: { createdAt: { gte: oneYearAgo } },
      orderBy: { createdAt: 'asc' },
    });

    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const athleteData = new Array(12).fill(0);
    const coachData = new Array(12).fill(0);
    monthlyAthletes.forEach(item => {
      const monthIndex = new Date(item.createdAt).getMonth();
      athleteData[monthIndex] += item._count.id;
    });
    monthlyCoaches.forEach(item => {
      const monthIndex = new Date(item.createdAt).getMonth();
      coachData[monthIndex] += item._count.id;
    });
    monthlyData = {
      labels: months,
      athletes: athleteData,
      coaches: coachData,
    };
  } else {
    monthlyData = {
      labels: [period.charAt(0).toUpperCase() + period.slice(1)],
      athletes: [athletes],
      coaches: [coaches],
    };
  }

  return {
    period,
    newJoiners,
    oldJoiners,
    difference: newJoiners - oldJoiners,
    userGrowth: userGrowthPercent,
    monthlyData
  };
};

const getPopularAthletes = async (period: string = 'monthly') => {
  if (period && typeof period !== 'string') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Period must be a string');
  }
  const { start: periodStart, end: periodEnd } = getDateRange(period);

  const athleteBookingGroups = await prisma.booking.groupBy({
    by: ['athleteId'],
    _count: { id: true },
    where: {
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { _count: { id: 'desc' } },
    take: 4,
  });

  const athleteIds = athleteBookingGroups.map(b => b.athleteId);
  const athletes = await prisma.athlete.findMany({
    where: { id: { in: athleteIds } },
    select: {
      id: true,
      fullName: true,
      category: true,
    },
  });
  const athleteMap = new Map(athletes.map(a => [a.id, a]));

  const popularAthletes = athleteBookingGroups.map(b => {
    const a = athleteMap.get(b.athleteId);
    return {
      name: a?.fullName || 'Unknown',
      category: a?.category?.[0] || 'Unknown',
      bookingCount: b._count.id,
    };
  });

  return { period, popularAthletes };
};
const getPopularCoaches = async (period: string = 'monthly') => {
  if (period && typeof period !== 'string') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Period must be a string');
  }
  const { start: periodStart, end: periodEnd } = getDateRange(period);
  const coachesBookingGroups = await prisma.booking.groupBy({
    by: ['coachId'],
    _count: { id: true },
    where: {
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { _count: { id: 'desc' } },
    take: 4,
  });
  const coachIds = coachesBookingGroups.map(b => b.coachId);
  const coaches = await prisma.coach.findMany({
    where: { id: { in: coachIds } },
    select: {
      id: true,
      fullName: true,
      specialty: {
        select: {
          title: true,
        },
      },
    },
  });
  const coachMap = new Map(coaches.map(a => [a.id, a]));
  const popularCoaches = coachesBookingGroups.map(b => {
    const c = coachMap.get(b.coachId);
    return {
      name: c?.fullName || 'Unknown',
      category: c?.specialty?.title || 'Unknown',
      bookingCount: b._count.id,
    };
  });

  return { period, popularCoaches };
};

const getHomePageData = async (coachMail: string) => {
  const coach = await prisma.coach.findUnique({
    where: {
      email: coachMail,
    },
    include: {
      specialty: true,
    },
  });
  if (!coach) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized');
  }
  // now show coach data

  // Total Revenue: number of completed bookings * coach price
  const completedBookingsCount = await prisma.booking.count({
    where: {
      coachId: coach.id,
      status: BookingStatus.FINISHED,
    },
  });
  const totalRevenue = completedBookingsCount * (coach.price || 0);

  // Total Students (unique athletes)
  const uniqueAthletes = await prisma.booking.groupBy({
    by: ['athleteId'],
    where: {
      coachId: coach.id,
    },
  });
  const totalStudents = uniqueAthletes.length;

  // Completed Classes
  const completedClasses = await prisma.booking.count({
    where: {
      coachId: coach.id,
      status: 'FINISHED',
    },
  });

  // Session Time (calculate duration from timeSlot startTime and endTime, assuming 60 min per slot)
  const completedBookingsWithSlots = await prisma.booking.findMany({
    where: {
      coachId: coach.id,
      status: 'FINISHED',
    },
    include: {
      timeSlot: true,
    },
  });
  const sessionTime = completedBookingsWithSlots.reduce((sum, booking) => {
    if (booking.timeSlot) {
      const durationMinutes =
        (booking.timeSlot.endTime.getTime() -
          booking.timeSlot.startTime.getTime()) /
        (1000 * 60);
      return sum + (durationMinutes || 60);
    }
    return sum + 60;
  }, 0);

  // Today's Sessions
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const todaysSessions = await prisma.booking.findMany({
    where: {
      coachId: coach.id,
      status: {
        in: ['CONFIRMED', 'RESCHEDULED_ACCEPTED'],
      },
      bookingDate: {
        gte: today,
        lte: todayEnd,
      },
    },
    include: {
      athlete: {
        select: {
          fullName: true,
          profile: true,
        },
      },
      timeSlot: true,
    },
    orderBy: {
      bookingDate: 'asc',
    },
  });

  // Helper function to format time
  const formatTimeRange = (startTime: Date, endTime: Date): string => {
    const formatTime = (date: Date): string => {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    };
    return `${formatTime(startTime)} - ${formatTime(endTime)}`;
  };

  // Format sessions if needed, but return raw for frontend
  const formattedSessions = todaysSessions.map(booking => ({
    id: booking.id,
    athlete: booking.athlete,
    sessionType: `${coach.specialty.title} Session`,
    price: coach.price || 0,
    date: booking.bookingDate.toISOString().split('T')[0],
    time: booking.timeSlot
      ? formatTimeRange(booking.timeSlot.startTime, booking.timeSlot.endTime)
      : '11:00 AM - 12:00 PM', 
    status: booking.status,
  }));

  return {
    totalRevenue,
    totalStudents,
    sessionTime,
    completedClasses,
    todaysSessions: formattedSessions,
  };
};

export const MetaServices = {
  getDashboardData,
  getUserStats,
  getPopularAthletes,
  getPopularCoaches,
  getHomePageData,
};
