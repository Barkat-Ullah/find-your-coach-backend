import { Request } from 'express';
import { prisma } from '../../utils/prisma';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';
import { BookingStatus } from '@prisma/client';

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

  // Last month calculations
  const now = new Date();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const newAthletesLastMonth = await prisma.athlete.count({
    where: {
      createdAt: {
        gte: lastMonthStart,
        lte: lastMonthEnd,
      },
    },
  });
  const newCoachesLastMonth = await prisma.coach.count({
    where: {
      createdAt: {
        gte: lastMonthStart,
        lte: lastMonthEnd,
      },
    },
  });
  const newJoiners = newAthletesLastMonth + newCoachesLastMonth;

  // Previous month for growth calculation
  const prevMonthStart = new Date(
    lastMonthStart.getFullYear(),
    lastMonthStart.getMonth() - 1,
    1,
  );
  const prevMonthEnd = new Date(
    lastMonthStart.getFullYear(),
    lastMonthStart.getMonth(),
    0,
  );

  const prevAthletes = await prisma.athlete.count({
    where: {
      createdAt: {
        gte: prevMonthStart,
        lte: prevMonthEnd,
      },
    },
  });
  const prevCoaches = await prisma.coach.count({
    where: {
      createdAt: {
        gte: prevMonthStart,
        lte: prevMonthEnd,
      },
    },
  });
  const prevTotalUsers = prevAthletes + prevCoaches;
  const currentTotalUsersLastMonth = newAthletesLastMonth + newCoachesLastMonth;
  const userGrowthRate =
    prevTotalUsers > 0
      ? ((currentTotalUsersLastMonth - prevTotalUsers) / prevTotalUsers) * 100
      : 0;
  const userGrowth = Math.round(userGrowthRate);
  const userGrowthPercent =
    userGrowth >= 0 ? `+${userGrowth}%` : `${userGrowth}%`;

  // Monthly user statistics for chart (last year, summed by month)
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const monthlyAthletes = await prisma.athlete.groupBy({
    by: ['createdAt'],
    _count: {
      id: true,
    },
    where: {
      createdAt: {
        gte: oneYearAgo,
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
  const monthlyCoaches = await prisma.coach.groupBy({
    by: ['createdAt'],
    _count: {
      id: true,
    },
    where: {
      createdAt: {
        gte: oneYearAgo,
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  // Process monthly data into chart format (sum per month index 0-11)
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
  const athleteMonthlyData = new Array(12).fill(0);
  const coachMonthlyData = new Array(12).fill(0);

  monthlyAthletes.forEach(item => {
    const monthIndex = new Date(item.createdAt).getMonth();
    athleteMonthlyData[monthIndex] += item._count.id;
  });
  monthlyCoaches.forEach(item => {
    const monthIndex = new Date(item.createdAt).getMonth();
    coachMonthlyData[monthIndex] += item._count.id;
  });

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
    select: { id: true, title: true },
  });
  const specMap = new Map(specialties.map(s => [s.id, s.title]));
  const popularSports = sportGroups.map(g => ({
    name: specMap.get(g.specialtyId) || 'Unknown',
    count: g._count.id,
  }));

  //6 Popular Coaches (top 4 by booking count)
  const coachBookingGroups = await prisma.booking.groupBy({
    by: ['coachId'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 4,
  });
  const coachIds = coachBookingGroups.map(b => b.coachId);
  const coaches = await prisma.coach.findMany({
    where: { id: { in: coachIds } },
    include: { specialty: true },
  });
  const coachMap = new Map(coaches.map(c => [c.id, c]));
  const popularCoaches = coachBookingGroups.map(b => {
    const c = coachMap.get(b.coachId);
    return {
      name: c?.fullName || 'Unknown',
      category: c?.specialty?.title || 'Unknown',
    };
  });

  //7 Popular Athletes (top 4 by booking count)
  const athleteBookingGroups = await prisma.booking.groupBy({
    by: ['athleteId'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 4,
  });
  const athleteIds = athleteBookingGroups.map(b => b.athleteId);
  const athletes = await prisma.athlete.findMany({
    where: { id: { in: athleteIds } },
    select: { id: true, fullName: true, category: true },
  });
  const athleteMap = new Map(athletes.map(a => [a.id, a]));
  const popularAthletes = athleteBookingGroups.map(b => {
    const a = athleteMap.get(b.athleteId);
    return {
      name: a?.fullName || 'Unknown',
      category: a?.category?.[0] || 'Unknown',
    };
  });

  return {
    totalAthletes,
    totalCoaches,
    activeBookings,
    totalRevenue: totalRevenueAmount,
    userGrowth: userGrowthPercent,
    newJoiners,
    monthlyData: {
      labels: months,
      athletes: athleteMonthlyData,
      coaches: coachMonthlyData,
    },
    popularSports,
    popularAthletes,
    popularCoaches,
  };
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
      return sum + (durationMinutes || 60); // default 60 min if calculation fails
    }
    return sum + 60; // default 60 min
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
      : '11:00 AM - 12:00 PM', // default
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
  getHomePageData,
};
