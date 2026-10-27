import { z } from "zod";

const conversationIdSchema = z
  .string()
  .trim()
  .min(1, "Conversation ID is required");

export const conversationIdParamSchema = z.object({
  conversationId: conversationIdSchema,
});

export const createRatingSchema = z.object({
  score: z
    .coerce
    .number()
    .int("Score must be an integer")
    .min(1, "Score must be at least 1")
    .max(5, "Score cannot be greater than 5"),

  comment: z
    .string()
    .trim()
    .max(1000, "Comment cannot be greater than 1000 characters")
    .optional()
    .nullable(),
});