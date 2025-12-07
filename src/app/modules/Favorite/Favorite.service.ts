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

  // User exists + role check (ATHLETE only)
  const user = await prisma.user.findUnique({
    where: { email: athleteEmail },
    select: { id: true, role: true },
  });
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  if (user.role !== 'ATHLETE')
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Only athletes can toggle favorites',
    );

  // Coach exists
  const coach = await prisma.coach.findUnique({ where: { email: coachEmail } });
  if (!coach) throw new AppError(httpStatus.NOT_FOUND, 'Coach not found');

  // Use transaction to avoid race condition
  return await prisma.$transaction(async tx => {
    // Find existing
    const existing = await tx.favorite.findUnique({
      where: { athleteEmail_coachEmail: { athleteEmail, coachEmail } },
    });

    if (existing) {
      // Toggle
      const newIsFavorite = !existing.isFavorite;
      const result = await tx.favorite.update({
        where: { id: existing.id },
        data: { isFavorite: newIsFavorite },
        select: {
          id: true,
          isFavorite: true,
          athleteEmail: true,
          coachEmail: true,
          createdAt: true,
        },
      });
      return result;
    }

    // Create new
    const created = await tx.favorite.create({
      data: { athleteEmail, coachEmail, isFavorite: true },
      select: {
        id: true,
        isFavorite: true,
        athleteEmail: true,
        coachEmail: true,
        createdAt: true,
      },
    });
    return created;
  });
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
  // await prisma.favorite.updateMany({
  //   data: {
  //     isFavorite: true,
  //   },
  // });

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
      review: {
        select: {
          rating: true,
        },
      },
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

  const coachMap = new Map(
    coaches.map(c => {
      const ratings = c.review?.map(r => r.rating) ?? [];
      const reviewCount = ratings.length;
      const averageRating =
        reviewCount > 0
          ? ratings.reduce((sum: number, rating: number) => sum + rating, 0) /
            reviewCount
          : null;

      return [
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
          averageRating,
        },
      ];
    }),
  );

  return favorites.map(f => ({
    id: f.id,
    isFavorite: f.isFavorite,
    coach: coachMap.get(f.coachEmail) ?? null,
  }));
};

export const FavoriteServices = {
  toggleFavorite,
  getFavorites,
};
