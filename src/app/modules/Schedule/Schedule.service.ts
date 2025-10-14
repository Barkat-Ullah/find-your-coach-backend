import { Request } from 'express';
import { prisma } from '../../utils/prisma';
import { SlotStatus } from '@prisma/client';

const createIntoDb = async (req: Request) => {
  const coachMail = req.user.email;
  const { slotDate, startTime, endTime } = req.body;

  const intervalTime = 60; // minutes

  // Find coach by email
  const coach = await prisma.coach.findUnique({
    where: { email: coachMail },
  });

  if (!coach) {
    throw new Error('Coach not found');
  }

  // Parse the slot date and times
  const slotDateObj = new Date(slotDate);

  // Create DateTime objects for start and end times on the slot date
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  const startDateTime = new Date(slotDateObj);
  startDateTime.setHours(startHour, startMinute, 0, 0);

  const endDateTime = new Date(slotDateObj);
  endDateTime.setHours(endHour, endMinute, 0, 0);

  // Create or update CoachAvailability
  const availability = await prisma.coachAvailability.upsert({
    where: {
      coachId_slotDate: {
        coachId: coach.id,
        slotDate: slotDateObj,
      },
    },
    update: {
      startTime: startDateTime,
      endTime: endDateTime,
      isActive: true,
      updatedAt: new Date(),
    },
    create: {
      coachId: coach.id,
      slotDate: slotDateObj,
      startTime: startDateTime,
      endTime: endDateTime,
      isActive: true,
    },
  });

  // Generate time slots based on interval
  const schedules = [];
  let currentTime = new Date(startDateTime);

  while (currentTime < endDateTime) {
    const slotStart = new Date(currentTime);
    const slotEnd = new Date(currentTime);
    slotEnd.setMinutes(slotEnd.getMinutes() + intervalTime);

    // Don't create slot if it exceeds end time
    if (slotEnd > endDateTime) {
      break;
    }

    schedules.push({
      availabilityId: availability.id,
      startTime: slotStart,
      endTime: slotEnd,
      isBooked: false,
      status: SlotStatus.ACTIVE,
    });

    // Move to next interval
    currentTime.setMinutes(currentTime.getMinutes() + intervalTime);
  }

  // Delete existing time slots for this availability (optional, if updating)
  await prisma.timeSlot.deleteMany({
    where: { availabilityId: availability.id },
  });

  // Create each time slot individually to get full records with IDs
  const createdSlots = await Promise.all(
    schedules.map(async schedule => {
      return await prisma.timeSlot.create({
        data: schedule,
      });
    }),
  );

  // Return with IDs (now available from createdSlots)
  return {
    availability: availability,
    slotsCreated: createdSlots.length, 
    slots: createdSlots.map(slot => ({
      status: slot.status,
      start: slot.startTime.toTimeString().slice(0, 5),
      end: slot.endTime.toTimeString().slice(0, 5),
      id: slot.id, 
    })),
  };
};

const getAllSchedule = async (query: Record<string, any>) => {
  console.log(query);
  return [];
};

const getMySchedule = async (userId: string) => {
  console.log('Fetching my Schedule for user:', userId);
  return [];
};

const getScheduleByIdFromDB = async (id: string) => {
  console.log(id);
  return null;
};

const updateIntoDb = async (id: string, data: Partial<any>) => {
  console.dir({ id, data });
  return null;
};

const deleteIntoDb = async (id: string) => {
  console.log(id);
  return null;
};

const softDeleteIntoDb = async (id: string) => {
  console.log(id);
  return null;
};

export const ScheduleServices = {
  createIntoDb,
  getAllSchedule,
  getMySchedule,
  getScheduleByIdFromDB,
  updateIntoDb,
  deleteIntoDb,
  softDeleteIntoDb,
};
