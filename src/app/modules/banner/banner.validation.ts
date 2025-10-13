import { z } from "zod";

const createBannerZodSchema = z.object({
  body: z.object({
  
    name: z.string({ required_error: "Name is required" }),
  }),
});

const updateBannerZodSchema = z.object({
  body: z.object({
    name: z.string().optional(),
  }),
});

export const BannerValidation = {
  createBannerZodSchema,
  updateBannerZodSchema,
};
