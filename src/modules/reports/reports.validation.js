import { z } from "zod";

export const createReportSchema = z.object({
  targetType: z.enum([
    "MESSAGE",
    "CONVERSATION",
    "USER_PROFILE",
  ]),

  targetId: z
    .string()
    .trim()
    .min(1, "Target ID is required"),

  reason: z
    .string()
    .trim()
    .min(1, "Report reason is required")
    .max(1000, "Report reason cannot be greater than 1000 characters"),
});