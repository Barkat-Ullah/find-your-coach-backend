// import { UserRoleEnum } from '@prisma/client';
// import * as bcrypt from 'bcrypt';
// import config from '../../config';
// import { prisma } from '../utils/prisma';

// const superAdminData = {
//   firstName: 'Super',
//   lastName: 'Admin',
//   email: 'admin@gmail.com',
//   password: '123456',
//   phoneNumber: '01821558090',
//   role: UserRoleEnum.SUPERADMIN,
//   isAgreeWithTerms: true,
//   isEmailVerified: true,
// };

// const seedSuperAdmin = async () => {
//   try {
//     // Check if a super admin already exists
//     const isSuperAdminExists = await prisma.user.findFirst({
//       where: {
//         role: UserRoleEnum.SUPERADMIN,
//       },
//     });

//     // If not, create one
//     if (!isSuperAdminExists) {
//       superAdminData.password = await bcrypt.hash(
//         config.super_admin_password as string,
//         Number(config.bcrypt_salt_rounds) || 12,
//       );
//       await prisma.user.create({
//         data: superAdminData,
//       });
//       console.log('Super Admin created successfully.');
//     } else {
//       return;
//       //   console.log("Super Admin already exists.");
//     }
//   } catch (error) {
//     console.error('Error seeding Super Admin:', error);
//   }
// };

// export default seedSuperAdmin;

import { UserRoleEnum } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import config from '../../config';
import { prisma } from '../utils/prisma';

const adminData = {
  fullName: 'Admin',
  email: 'admin1@gmail.com',
  password: '123456',
  phoneNumber: '01821558090',
  role: UserRoleEnum.ADMIN,
  isAgreeWithTerms: true,
  isEmailVerified: true,
  // isApproved: true,
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
      adminData.password = await bcrypt.hash(
        config.super_admin_password as string,
        Number(config.bcrypt_salt_rounds) || 12,
      );
      await prisma.user.create({
        data: adminData,
      });
      console.log('✅ Super Admin created successfully.');
    } else {
      console.log('❌ Super Admin already exists.');
    }
  } catch (error) {
    console.error('Error seeding Super Admin:', error);
  }
};

export default seedSuperAdmin;
