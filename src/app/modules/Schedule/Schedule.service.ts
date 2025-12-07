import { Request } from 'express';
import { prisma } from '../../utils/prisma';
import { SlotStatus } from '@prisma/client';
import { formatTimeWithAMPM } from './Schedule.constants';

const createIntoDb = async (req: Request) => {
  const coachMail = req.user.email;
  const { slotDate, startTime, endTime } = req.body;

  const intervalTime = 60;

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
    availability: {
      ...availability,
      startTime: formatTimeWithAMPM(availability.startTime), 
      endTime: formatTimeWithAMPM(availability.endTime),
    },
    slotsCreated: createdSlots.length,
    slots: createdSlots.map(slot => ({
      id: slot.id,
      startTime: formatTimeWithAMPM(slot.startTime), // "10:00 AM"
      endTime: formatTimeWithAMPM(slot.endTime), // "11:00 AM"
      status: slot.status,
    })),
  };
};

const getSlotsByDate = async (req: Request) => {
  const { slotDate } = req.query; // Format: "2024-02-20"
  const coachMail = req.user?.email;

  const coach = await prisma.coach.findUnique({
    where: { email: coachMail },
  });

  if (!coach) {
    throw new Error('Coach not found');
  }
  
  const dateObj = new Date(slotDate as string);

  // Get availability for this date
  const availability = await prisma.coachAvailability.findUnique({
    where: {
      coachId_slotDate: {
        coachId: coach.id,
        slotDate: dateObj,
      },
    },
    include: {
      coach: { select: { id: true, fullName: true } },
      timeSlots: {
        orderBy: {
          startTime: 'asc',
        },
      },
    },
  });

  if (!availability) {
    return {
      message: 'No slots found for this date',
      slots: [],
    };
  }

  return {
    date: slotDate,
    isActive: availability.isActive,
    availabilityTime: {
      coachId: availability.coach.id,
      coachName: availability.coach.fullName,
      startTime: formatTimeWithAMPM(availability.startTime),
      endTime: formatTimeWithAMPM(availability.endTime),
    },
    slots: availability.timeSlots.map(slot => ({
      id: slot.id,
      startTime: formatTimeWithAMPM(slot.startTime), // "10:00 AM"
      endTime: formatTimeWithAMPM(slot.endTime), // "11:00 AM"
      status: slot.status,
      isBooked: slot.isBooked,
    })),
  };
};

const toggleSlotStatus = async (req: Request) => {
  const { slotId } = req.params;
  const coachMail = req.user?.email;

  // Find coach
  const coach = await prisma.coach.findUnique({
    where: { email: coachMail },
  });

  if (!coach) {
    throw new Error('Coach not found');
  }

  // Verify the slot belongs to this coach
  const slot = await prisma.timeSlot.findUnique({
    where: { id: slotId },
    include: {
      availability: true,
    },
  });

  if (!slot) {
    throw new Error('Slot not found');
  }

  if (slot.availability.coachId !== coach.id) {
    throw new Error("Unauthorized: This slot doesn't belong to you");
  }

  // Check if slot is already booked
  if (slot.isBooked && slot.status === 'ACTIVE') {
    throw new Error('Cannot deactivate a booked slot');
  }

  // Toggle the status
  const newStatus = slot.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

  // Update slot status
  const updatedSlot = await prisma.timeSlot.update({
    where: { id: slotId },
    data: { status: newStatus },
  });

  return {
    message: `Slot ${newStatus === 'ACTIVE' ? 'activated' : 'deactivated'} successfully`,
    slot: {
      id: updatedSlot.id,
      startTime: formatTimeWithAMPM(slot.startTime), // "10:00 AM"
      endTime: formatTimeWithAMPM(slot.endTime), // "11:00 AM"
      status: updatedSlot.status,
      isBooked: updatedSlot.isBooked,
    },
  };
};

const addNewSlot = async (req: Request) => {
  const { slotDate, startTime, endTime } = req.body;
  const coachMail = req.user?.email;

  // Find coach
  const coach = await prisma.coach.findUnique({
    where: { email: coachMail },
  });

  if (!coach) {
    throw new Error('Coach not found');
  }

  // Parse the slot date and times
  const slotDateObj = new Date(slotDate);
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  const startDateTime = new Date(slotDateObj);
  startDateTime.setHours(startHour, startMinute, 0, 0);

  const endDateTime = new Date(slotDateObj);
  endDateTime.setHours(endHour, endMinute, 0, 0);

  // Validate: end time must be after start time
  if (endDateTime <= startDateTime) {
    throw new Error('End time must be after start time');
  }

  // Check if CoachAvailability exists for this date
  let availability = await prisma.coachAvailability.findUnique({
    where: {
      coachId_slotDate: {
        coachId: coach.id,
        slotDate: slotDateObj,
      },
    },
    include: {
      timeSlots: true,
    },
  });

  // If no availability exists, create it
  if (!availability) {
    availability = await prisma.coachAvailability.create({
      data: {
        coachId: coach.id,
        slotDate: slotDateObj,
        startTime: startDateTime,
        endTime: endDateTime,
      },
      include: {
        timeSlots: true,
      },
    });
  }

  // Check for conflicting slots (overlapping time)
  const hasConflict = availability.timeSlots.some(existingSlot => {
    const existingStart = existingSlot.startTime;
    const existingEnd = existingSlot.endTime;

    // Check if new slot overlaps with existing slot
    return (
      (startDateTime >= existingStart && startDateTime < existingEnd) || // New start is within existing
      (endDateTime > existingStart && endDateTime <= existingEnd) || // New end is within existing
      (startDateTime <= existingStart && endDateTime >= existingEnd) // New slot completely covers existing
    );
  });

  if (hasConflict) {
    // Find the conflicting slot for better error message
    const conflictingSlot = availability.timeSlots.find(slot => {
      const existingStart = slot.startTime;
      const existingEnd = slot.endTime;
      return (
        (startDateTime >= existingStart && startDateTime < existingEnd) ||
        (endDateTime > existingStart && endDateTime <= existingEnd) ||
        (startDateTime <= existingStart && endDateTime >= existingEnd)
      );
    });

    return {
      success: false,
      message: 'Time slot already exists or conflicts with an existing slot',
      conflictingSlot: conflictingSlot
        ? {
            startTime: formatTimeWithAMPM(conflictingSlot.startTime),
            endTime: formatTimeWithAMPM(conflictingSlot.endTime),
            status: conflictingSlot.status,
          }
        : null,
    };
  }

  // Create the new time slot
  const newSlot = await prisma.timeSlot.create({
    data: {
      availabilityId: availability.id,
      startTime: startDateTime,
      endTime: endDateTime,
      isBooked: false,
      status: 'ACTIVE',
    },
  });

  return {
    success: true,
    message: 'New slot created successfully',
    slot: {
      id: newSlot.id,
      startTime: formatTimeWithAMPM(newSlot.startTime),
      endTime: formatTimeWithAMPM(newSlot.endTime),
      status: newSlot.status,
      isBooked: newSlot.isBooked,
    },
  };
};

export const ScheduleServices = {
  createIntoDb,
  getSlotsByDate,
  toggleSlotStatus,
  addNewSlot,
};
