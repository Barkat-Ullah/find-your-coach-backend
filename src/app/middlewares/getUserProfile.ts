import { UserRoleEnum } from '@prisma/client';
import { prisma } from '../utils/prisma';

// Helper function to get user profile based on role
export async function getUserProfile(userId: string, role: UserRoleEnum) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      admin:
        role === 'ADMIN'
          ? {
              select: {
                profile: true,
                phoneNumber: true,
                address: true,
              },
            }
          : undefined,
      coach:
        role === 'COACH'
          ? {
              select: {
                profile: true,
                phoneNumber: true,
                experience: true,
                location: true,
                expertise: true,
                price: true,
              },
            }
          : undefined,
      athlete:
        role === 'ATHLETE'
          ? {
              select: {
                profile: true,
                phoneNumber: true,
                category: true,
                address: true,
              },
            }
          : undefined,
    },
  });

  if (!user) return null;

  // Flatten the profile data
  let profile = null;
  if (role === 'ADMIN' && user.admin) {
    profile = user.admin.profile;
  } else if (role === 'COACH' && user.coach) {
    profile = user.coach.profile;
  } else if (role === 'ATHLETE' && user.athlete) {
    profile = user.athlete.profile;
  }

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    profile,
    ...(role === 'ADMIN' && user.admin
      ? {
          phoneNumber: user.admin.phoneNumber,
          address: user.admin.address,
        }
      : {}),
    ...(role === 'COACH' && user.coach
      ? {
          phoneNumber: user.coach.phoneNumber,
          experience: user.coach.experience,
          location: user.coach.location,
          expertise: user.coach.expertise,
          price: user.coach.price,
        }
      : {}),
    ...(role === 'ATHLETE' && user.athlete
      ? {
          phoneNumber: user.athlete.phoneNumber,
          category: user.athlete.category,
          address: user.athlete.address,
        }
      : {}),
  };
}

// Validation function for allowed role pairs
function isValidChatPair(
  senderRole: UserRoleEnum,
  receiverRole: UserRoleEnum,
): boolean {
  return (
    (senderRole === 'ATHLETE' &&
      (receiverRole === 'COACH' || receiverRole === 'ADMIN')) ||
    (senderRole === 'COACH' &&
      (receiverRole === 'ATHLETE' || receiverRole === 'ADMIN')) ||
    (senderRole === 'ADMIN' &&
      (receiverRole === 'ATHLETE' || receiverRole === 'COACH')) ||
    (receiverRole === 'ATHLETE' &&
      (senderRole === 'COACH' || senderRole === 'ADMIN')) ||
    (receiverRole === 'COACH' &&
      (senderRole === 'ATHLETE' || senderRole === 'ADMIN')) ||
    (receiverRole === 'ADMIN' &&
      (senderRole === 'ATHLETE' || senderRole === 'COACH'))
  );
}
