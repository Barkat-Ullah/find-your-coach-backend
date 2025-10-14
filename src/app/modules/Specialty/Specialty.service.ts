import { prisma } from '../../utils/prisma';
import { Request } from 'express';
import { uploadToDigitalOceanAWS } from '../../utils/uploadToDigitalOceanAWS';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';

// ✅ Create specialty
const createIntoDb = async (req: Request) => {
  const { title } = JSON.parse(req.body.data);
  const file = req.file as Express.Multer.File | undefined;

  let iconUrl: string | null = null;

  if (file) {
    const uploaded = await uploadToDigitalOceanAWS(file);
    iconUrl = uploaded.Location;
  }

  const result = await prisma.specialties.create({
    data: {
      title,
      icon: iconUrl,
    },
  });

  return result;
};

// ✅ Get all specialties
const getAllSpecialty = async (query: Record<string, any>) => {
  const result = await prisma.specialties.findMany({
    where: {
      isActive: true,
    },
    orderBy: { title: 'asc' },
  });
  return result;
};

// ✅ Get specialty by ID
const getSpecialtyByIdFromDB = async (id: string) => {
  const result = await prisma.specialties.findUnique({
    where: { id },
  });

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Specialty not found!');
  }

  return result;
};

// ✅ Delete specialty
const deleteIntoDb = async (id: string) => {
  const existing = await prisma.specialties.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Specialty not found!');
  }
  const result = await prisma.specialties.update({
    where: { id },
    data: { isActive: false },
    select: {
      id: true,
      title: true,
      isActive: true,
    },
  });
  return result;
};

export const SpecialtyServices = {
  createIntoDb,
  getAllSpecialty,
  getSpecialtyByIdFromDB,
  deleteIntoDb,
};
