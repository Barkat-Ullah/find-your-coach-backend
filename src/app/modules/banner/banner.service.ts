import { Request } from 'express';
import { uploadToDigitalOceanAWS } from '../../utils/uploadToDigitalOceanAWS';
import { prisma } from '../../utils/prisma';

const createIntoDb = async (req: Request) => {
  const file = req.file as Express.Multer.File | undefined;
  const adminId = req.user.id;

  if (!file) {
    throw new Error('Banner image is required');
  }

  const uploaded = await uploadToDigitalOceanAWS(file);
  const iconUrl = uploaded.Location;

  const result = await prisma.banner.create({
    data: {
      adminId,
      image: iconUrl,
    },
  });

  return result;
};

const getAllBanner = async () => {
  const banners = await prisma.banner.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      image: true,
    },
  });
  return banners;
};

const getBannerByIdFromDB = async (id: string) => {
  const banner = await prisma.banner.findUnique({
    where: { id },
    select: {
      id: true,
      image: true,
    },
  });

  if (!banner) {
    throw new Error('Banner not found');
  }

  return banner;
};

const deleteIntoDb = async (id: string) => {
  const deleted = await prisma.banner.delete({
    where: { id },
  });

  return deleted;
};

export const BannerServices = {
  createIntoDb,
  getAllBanner,
  getBannerByIdFromDB,
  deleteIntoDb,
};
