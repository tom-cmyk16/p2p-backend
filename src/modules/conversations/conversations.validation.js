import { z } from "zod";

export const createConversationSchema = z.object({
  tutorId: z
    .string()
    .trim()
    .min(1, "Tutor ID is required"),
  courseId: z.string().trim().min(1).optional(),
});