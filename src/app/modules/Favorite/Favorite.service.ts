// src/app/modules/Favorite/favorites.service.ts
import httpStatus from 'http-status';
import AppError from '../../errors/AppError';
import { prisma } from '../../utils/prisma';
import { Prisma } from '@prisma/client';

type ToggleResult = {
  isFavorite: boolean;
  favorite?: any;
};

const toggleFavorite = async (
  athleteEmail: string | undefined,
  coachEmail: string | undefined,
): Promise<ToggleResult> => {
  if (!athleteEmail)
    throw new AppError(httpStatus.UNAUTHORIZED, 'User email is required');
  if (!coachEmail)
    throw new AppError(httpStatus.BAD_REQUEST, 'coachEmail is required');

  // Optional: ensure athlete user exists (user table)
  const user = await prisma.user.findUnique({
    where: { email: athleteEmail },
    select: { id: true, role: true },
  });
  if (!user)
    throw new AppError(httpStatus.NOT_FOUND, 'User (athlete) not found');
  // Optional: ensure role is ATHLETE
  // if (user.role !== 'ATHLETE') throw new AppError(httpStatus.FORBIDDEN, 'Only athletes can favorite coaches');

  // ensure coach exists (by email)
  const coach = await prisma.coach.findUnique({ where: { email: coachEmail } });
  if (!coach) throw new AppError(httpStatus.NOT_FOUND, 'Coach not found');

  // find existing favorite by compound unique
  const existing = await prisma.favorite.findUnique({
    where: { athleteEmail_coachEmail: { athleteEmail, coachEmail } },
  });

  if (existing) {
    const deleted = await prisma.favorite.delete({
      where: { id: existing.id },
    });
    return { isFavorite: false, favorite: deleted };
  }

  try {
    const created = await prisma.favorite.create({
      data: { athleteEmail, coachEmail },
    });
    return { isFavorite: true, favorite: created };
  } catch (err: any) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const already = await prisma.favorite.findUnique({
        where: { athleteEmail_coachEmail: { athleteEmail, coachEmail } },
      });
      if (already) return { isFavorite: true, favorite: already };
    }
    throw err;
  }
};

const getFavorites = async (athleteEmail: string | undefined) => {
  if (!athleteEmail)
    throw new AppError(httpStatus.UNAUTHORIZED, 'User email is required');

  // Optionally check user exists
  const user = await prisma.user.findUnique({
    where: { email: athleteEmail },
    select: { id: true },
  });
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  const favorites = await prisma.favorite.findMany({
    where: { athleteEmail },
    orderBy: { createdAt: 'desc' },
  });

  if (!favorites.length) return [];

  // enrich with coach info (bulk fetch) — avoid nested required relation
  const coachEmails = Array.from(
    new Set(favorites.map(f => f.coachEmail).filter(Boolean)),
  );

  // 1) fetch coaches but only primitive fields (no nested specialty include)
  const coaches = await prisma.coach.findMany({
    where: { email: { in: coachEmails } },
    select: {
      id: true,
      email: true,
      fullName: true,
      profile: true,
      phoneNumber: true,
      price: true,
      experience: true,
      specialtyId: true,
    },
  });

  // 2) gather specialtyIds and fetch specialties in bulk
  const specialtyIds = Array.from(
    new Set(coaches.map(c => c.specialtyId).filter(Boolean)),
  );
  const specialties = specialtyIds.length
    ? await prisma.specialties.findMany({
        where: { id: { in: specialtyIds } },
        select: { id: true, title: true },
      })
    : [];

  const specialtyMap = new Map(specialties.map(s => [s.id, s.title]));

  // build coach map with embedded specialty title (or null if missing)
  const coachMap = new Map(
    coaches.map(c => [
      c.email,
      {
        id: c.id,
        email: c.email,
        fullName: c.fullName,
        profile: c.profile,
        phoneNumber: c.phoneNumber,
        price: c.price,
        experience: c.experience,
        specialty: c.specialtyId
          ? (specialtyMap.get(c.specialtyId) ?? null)
          : null,
      },
    ]),
  );

  return favorites.map(f => ({
    id: f.id,
    coach: coachMap.get(f.coachEmail) ?? null,
  }));
};

export const FavoriteServices = {
  toggleFavorite,
  getFavorites,
};
