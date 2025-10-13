import { z } from "zod";

const createSpecialtyZodSchema = z.object({
  body: z.object({
  
    name: z.string({ required_error: "Name is required" }),
  }),
});

const updateSpecialtyZodSchema = z.object({
  body: z.object({
    name: z.string().optional(),
  }),
});

export const SpecialtyValidation = {
  createSpecialtyZodSchema,
  updateSpecialtyZodSchema,
};
