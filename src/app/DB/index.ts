import { UserRoleEnum } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import config from '../../config';
import { prisma } from '../utils/prisma';

const adminData = {
  fullName: 'Admin',
  email: 'admin1@gmail.com',
  password: '123456',
  phoneNumber: '01821558090',
  // fcmToken,
  role: UserRoleEnum.ADMIN,
  isAgreeWithTerms: true,
  isEmailVerified: true,
  isApproved: true, 
};

const seedSuperAdmin = async () => {
  try {
    // Check if a super admin already exists
    const isSuperAdminExists = await prisma.user.findFirst({
      where: {
        role: UserRoleEnum.ADMIN,
      },
    });

    // If not, create one
    if (!isSuperAdminExists) {
      // Hash the password
      const hashedPassword = await bcrypt.hash(
        config.super_admin_password || adminData.password, // Use config password or fallback to adminData
        Number(config.bcrypt_salt_rounds) || 12,
      );

      // Create User and associated Admin record in a transaction
      await prisma.$transaction(async tx => {
        // Create User record
         await tx.user.create({
          data: {
            fullName: adminData.fullName,
            email: adminData.email,
            password: hashedPassword,
            role: adminData.role,
            // fcmToken:adminData.fcmToken,
            isEmailVerified: adminData.isEmailVerified,
            isApproved: adminData.isApproved,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Create Admin record linked to the User
        await tx.admin.create({
          data: {
            fullName: adminData.fullName,
            email: adminData.email,
            phoneNumber: adminData.phoneNumber,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        console.log(
          '✅ Super Admin and associated Admin record created successfully.',
        );
      });
    } else {
      console.log('❌ Super Admin already exists.');
    }
  } catch (error) {
    console.error('Error seeding Super Admin:', error);
  }
};

export default seedSuperAdmin;
