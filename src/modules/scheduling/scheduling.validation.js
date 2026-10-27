import { z } from "zod";

const id = z.string().trim().min(1);
const dateTime = z.string().datetime({ offset: true });

export const createAvailabilitySchema = z.object({
  startsAt: dateTime,
  endsAt: dateTime,
});

export const availabilityQuerySchema = z.object({
  tutorId: id.optional(),
  from: dateTime.optional(),
  to: dateTime.optional(),
});

export const bookWeeklySessionsSchema = z.object({
  tutorId: id,
  courseId: id,
  availabilityIds: z.array(id).length(3),
});

export const availabilityIdParamsSchema = z.object({
  availabilityId: id,
});

export const sessionIdParamsSchema = z.object({
  sessionId: id,
});

export const sessionMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const sessionMessageSchema = z.object({
  textContent: z.string().trim().min(1).max(5000),
});
