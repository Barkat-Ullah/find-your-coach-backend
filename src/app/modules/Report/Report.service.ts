import { Request } from 'express';
import { ReportReason, ReportStatus } from '@prisma/client';
import httpStatus from 'http-status';
import { prisma } from '../../utils/prisma';
import AppError from '../../errors/AppError';

const createIntoDb = async (req: Request) => {
  const { reportedToCoachId, reason, description } = req.body;
  const athleteEmail = req.user.email;

  // Verify the athlete exists
  const athlete = await prisma.athlete.findUnique({
    where: { email: athleteEmail },
    include: {
      user: true, 
    },
  });

  if (!athlete) {
    throw new AppError(httpStatus.NOT_FOUND, 'Athlete not found');
  }

  // Verify the coach exists
  const coach = await prisma.coach.findUnique({
    where: { id: reportedToCoachId },
    include: {
      user: true, 
    },
  });

  if (!coach) {
    throw new AppError(httpStatus.NOT_FOUND, 'Coach not found');
  }

  // Create the report
  const report = await prisma.report.create({
    data: {
      reportedById: athlete.user.id,
      reportedUserId: coach.user.id,
      reason: reason as ReportReason,
      description: description || null,
      reportedByAthleteId: athlete.id,
      reportedToCoachId: coach.id,
      status: ReportStatus.PENDING,
    },
    include: {
      reportedByAthlete: {
        select: {
          fullName: true,
          email: true,
          profile: true,
        },
      },
      reportedToCoach: {
        select: {
          fullName: true,
          email: true,
          profile: true,
        },
      },
    },
  });

  return report;
};

const getAllReport = async (query: Record<string, any>) => {
  const { status, reason, searchTerm, page = 1, limit = 10 } = query;

  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const whereConditions: any = {};

  // Filter by status
  if (status) {
    whereConditions.status = status;
  }

  // Filter by reason
  if (reason) {
    whereConditions.reason = reason;
  }

  // Search in coach name or athlete name
  if (searchTerm) {
    whereConditions.OR = [
      {
        reportedByAthlete: {
          fullName: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        },
      },
      {
        reportedToCoach: {
          fullName: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        },
      },
    ];
  }

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where: whereConditions,
      skip,
      take,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        reportedById: true,
        reportedUserId: true,
        reason: true,
        description: true,
        status: true,
        adminId: true,
        reportedByAthleteId: true,
        reportedByAthlete: {
          select: {
            fullName: true,
            email: true,
            profile: true,
            user: {
              select: {
                role: true,
              },
            },
          },
        },
        reportedToCoachId: true,
        reportedToCoach: {
          select: {
            fullName: true,
            email: true,
            profile: true,
            user: {
              select: {
                role: true,
              },
            },
          },
        },
        admin: {
          select: {
            id: true,
            profile: true,
            user: {
              select: {
                fullName: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    }),
    prisma.report.count({ where: whereConditions }),
  ]);

  return {
    data: reports,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
};

const getMyReport = async (userEmail: string) => {
  // Find the athlete by email
  const athlete = await prisma.athlete.findUnique({
    where: { email: userEmail },
  });

  if (!athlete) {
    throw new AppError(httpStatus.NOT_FOUND, 'Athlete not found');
  }

  // Get all reports created by this athlete
  const reports = await prisma.report.findMany({
    where: {
      reportedByAthleteId: athlete.id,
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
      reportedUserId: true,
      reason: true,
      description: true,
      status: true,
      reportedToCoach: {
        select: {
          fullName: true,
          email: true,
          profile: true,
        },
      },
    },
  });

  return reports;
};

const getReportByIdFromDB = async (id: string) => {
  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      reportedByAthlete: {
        select: {
          fullName: true,
          email: true,
          profile: true,
          user: {
            select: {
              role: true,
            },
          },
        },
      },
      reportedToCoach: {
        select: {
          fullName: true,
          email: true,
          profile: true,
          user: {
            select: {
              role: true,
            },
          },
        },
      },
      admin: {
        select: {
          fullName: true,
          email: true,
          profile: true,
        },
      },
    },
  });

  if (!report) {
    throw new AppError(httpStatus.NOT_FOUND, 'Report not found');
  }

  return report;
};

const updateIntoDb = async (id: string, req: Request) => {
  const adminMail = req.user.email;

  // Find the admin
  const admin = await prisma.admin.findUnique({
    where: { email: adminMail },
  });

  if (!admin) {
    throw new AppError(httpStatus.NOT_FOUND, 'Admin not found');
  }

  // Verify report exists
  const existingReport = await prisma.report.findUnique({
    where: { id },
  });

  if (!existingReport) {
    throw new AppError(httpStatus.NOT_FOUND, 'Report not found');
  }

  const newStatus =
    existingReport.status === ReportStatus.PENDING
      ? ReportStatus.REVIEWED
      : ReportStatus.PENDING;

  // Update the report
  const updatedReport = await prisma.report.update({
    where: { id },
    data: {
      status: newStatus,
      adminId: admin.id,
      updatedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      description: true,
    },
  });

  return updatedReport;
};

const softDeleteIntoDb = async (id: string) => {
  const report = await prisma.report.findUnique({
    where: { id },
  });

  if (!report) {
    throw new AppError(httpStatus.NOT_FOUND, 'Report not found');
  }

  // Mark as resolved instead of deleting
  const updatedReport = await prisma.report.update({
    where: { id },
    data: {
      status: ReportStatus.RESOLVED,
      updatedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      description: true,
    },
  });

  return updatedReport;
};

export const ReportServices = {
  createIntoDb,
  getAllReport,
  getMyReport,
  getReportByIdFromDB,
  updateIntoDb,
  softDeleteIntoDb,
};
