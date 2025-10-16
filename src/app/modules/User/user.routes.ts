import express from 'express';
import auth from '../../middlewares/auth';
import { UserControllers } from './user.controller';
import validateRequest from '../../middlewares/validateRequest';
import { userValidation } from './user.validation';
import { UserRoleEnum } from '@prisma/client';
import { upload } from '../../utils/fileUploader';

const router = express.Router();

router.get(
  '/',
  UserControllers.getAllUsers,
);
router.get(
  '/un-approve',
  UserControllers.getAllUnApproveCoach,
);
router.get(
  '/me',
  auth(UserRoleEnum.ADMIN, UserRoleEnum.ATHLETE, UserRoleEnum.COACH),
  UserControllers.getMyProfile,
);

router.get('/:id', auth('ANY'), UserControllers.getUserDetails);

router.delete('/soft-delete', auth('ANY'), UserControllers.softDeleteUser);
router.delete(
  '/hard-delete/:id',
  auth(UserRoleEnum.ADMIN),
  UserControllers.hardDeleteUser,
);

router.put(
  '/user-role/:id',
  auth(UserRoleEnum.ADMIN),
  validateRequest.body(userValidation.updateUserRoleSchema),
  UserControllers.updateUserRoleStatus,
);

router.put(
  '/user-status/:id',
  auth(UserRoleEnum.ADMIN),
  UserControllers.updateUserStatus,
);
router.put(
  '/approve-user/:id',
  auth(UserRoleEnum.ADMIN),
  UserControllers.updateUserApproval,
);

router.put(
  '/update-user/:id',
  upload.single('file'),
  auth(UserRoleEnum.ADMIN),
  validateRequest.body(userValidation.updateUser),
  UserControllers.updateUser,
);

router.put(
  '/update-profile',
  auth(UserRoleEnum.ADMIN, UserRoleEnum.ATHLETE, UserRoleEnum.COACH),
  upload.fields([
    { name: 'profile', maxCount: 1 },
    { name: 'certificate', maxCount: 1 }, 
  ]),
  UserControllers.updateMyProfile,
);


export const UserRouters = router;
