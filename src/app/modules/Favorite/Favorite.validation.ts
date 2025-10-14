import { z } from "zod";

const createFavoriteZodSchema = z.object({
  body: z.object({
  
    name: z.string({ required_error: "Name is required" }),
  }),
});

const updateFavoriteZodSchema = z.object({
  body: z.object({
    name: z.string().optional(),
  }),
});

export const FavoriteValidation = {
  createFavoriteZodSchema,
  updateFavoriteZodSchema,
};
