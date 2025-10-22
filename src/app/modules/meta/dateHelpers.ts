import AppError from "../../errors/AppError";
import httpStatus from 'http-status';


export interface DateRange {
  start: Date;
  end: Date;
}

export const getDateRange = (period: string, offset: number = 0): DateRange => {
  const now = new Date();
  let baseStart: Date, baseEnd: Date;

  switch (period.toLowerCase()) {
    case 'daily':
      baseStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      baseEnd = now;
      break;
    case 'weekly':
      baseStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      baseEnd = now;
      break;
    case 'monthly':
      baseStart = new Date(now.getFullYear(), now.getMonth() - offset - 1, 1);
      baseEnd = new Date(now.getFullYear(), now.getMonth() - offset, 0);
      break;
    case 'yearly':
      baseStart = new Date(now.getFullYear() - offset - 1, 0, 1);
      baseEnd = new Date(now.getFullYear() - offset - 1, 11, 31);
      break;
    default:
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Invalid period: daily, weekly, monthly, or yearly',
      );
  }

  // Apply offset by shifting back (for prev periods)
  if (offset > 0) {
    const rangeDuration = baseEnd.getTime() - baseStart.getTime();
    baseStart = new Date(baseStart.getTime() - rangeDuration);
    baseEnd = new Date(baseEnd.getTime() - rangeDuration);
  }

  return { start: baseStart, end: baseEnd };
};
