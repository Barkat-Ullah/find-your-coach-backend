import { z } from "zod";

const createBookingZodSchema = z.object({
  body: z.object({
  
    name: z.string({ required_error: "Name is required" }),
  }),
});

const updateBookingZodSchema = z.object({
  body: z.object({
    name: z.string().optional(),
  }),
});

export const BookingValidation = {
  createBookingZodSchema,
  updateBookingZodSchema,
};
