import { z } from 'zod';
import { ReportReason, ReportStatus } from '@prisma/client';

const createReportValidationSchema = z.object({
  body: z.object({
    reportedToCoachId: z.string({
      required_error: 'Coach ID is required',
    }),
    reason: z.nativeEnum(ReportReason, {
      required_error: 'Report reason is required',
      invalid_type_error: 'Invalid report reason',
    }),
    description: z.string().optional(),
  }),
});

const updateReportValidationSchema = z.object({
  body: z.object({
    status: z.nativeEnum(ReportStatus).optional(),
    adminId: z.string().optional(),
  }),
});

export const ReportValidation = {
  createReportValidationSchema,
  updateReportValidationSchema,
};
