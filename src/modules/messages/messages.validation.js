import { z } from "zod";

const messageIdSchema = z
  .string()
  .trim()
  .min(1, "Conversation ID is required");

export const conversationIdParamSchema = z.object({
  conversationId: messageIdSchema,
});

export const messagePaginationQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .optional(),

  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit cannot be greater than 100")
    .optional(),
});

export const sendTextMessageSchema = z.object({
  type: z
    .literal("TEXT")
    .optional(),

  textContent: z
    .string()
    .trim()
    .min(1, "Message text is required"),
});