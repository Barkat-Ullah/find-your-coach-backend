import express from "express";
import { ScheduleController } from "./Schedule.controller";
import auth from "../../middlewares/auth";
import { UserRoleEnum } from "@prisma/client";


const router = express.Router();

router.get("/", ScheduleController.getAllSchedule);
router.get('/my', auth(UserRoleEnum.COACH), ScheduleController.getMySchedule);  
router.get("/:id", ScheduleController.getScheduleById);

router.post(
  "/",
  auth(UserRoleEnum.COACH),
  ScheduleController.createIntoDb
);
router.patch(
  "/:id",
  ScheduleController.updateIntoDb
);

router.delete("/:id", ScheduleController.deleteIntoDb);
router.delete("/soft/:id", ScheduleController.softDeleteIntoDb);

export const ScheduleRoutes = router;
