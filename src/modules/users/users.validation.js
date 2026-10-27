import { z } from "zod";

export const updateUserSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, "Full name cannot be empty")
      .optional(),

    regionId: z
      .string()
      .trim()
      .min(1, "Region ID cannot be empty")
      .nullable()
      .optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters"),
  })
  .strict();