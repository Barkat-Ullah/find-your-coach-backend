import express from 'express';
import { MetaController } from './meta.controller';
import auth from '../../middlewares/auth';
import { UserRoleEnum } from '@prisma/client';

const router = express.Router();

router.get('/admin', auth(UserRoleEnum.ADMIN), MetaController.getDashboardData);
router.get('/user-stats', MetaController.getUserStatsController);

// GET /api/popular-athletes?period=weekly
router.get('/popular-athletes', MetaController.getPopularAthletesController);

// GET /api/popular-coaches?period=yearly
router.get('/popular-coaches', MetaController.getPopularCoachesController);
router.get('/coach', auth(UserRoleEnum.COACH), MetaController.getHomePageData);

export const MetaRoutes = router;
