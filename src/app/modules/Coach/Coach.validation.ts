import { z } from "zod";

const createCoachZodSchema = z.object({
  body: z.object({
  
    name: z.string({ required_error: "Name is required" }),
  }),
});

const updateCoachZodSchema = z.object({
  body: z.object({
    name: z.string().optional(),
  }),
});

export const CoachValidation = {
  createCoachZodSchema,
  updateCoachZodSchema,
};
