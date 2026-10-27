import { z } from "zod";

const applicationStatuses = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
];

const reportStatuses = [
  "PENDING",
  "REVIEWED",
  "ACTION_TAKEN",
  "DISMISSED",
];

const userStatuses = [
  "APPROVED",
  "SUSPENDED",
  "BANNED",
];

export const adminTutorApplicationsQuerySchema = z.object({
  status: z.enum(applicationStatuses, {
    errorMap: () => ({
      message:
        "Status must be SUBMITTED, UNDER_REVIEW, APPROVED, or REJECTED",
    }),
  }).optional(),
});

export const applicationIdParamSchema = z.object({
  applicationId: z.string().trim().min(1, "Application ID is required"),
});

export const applicationDocumentParamsSchema = z.object({
  applicationId: z.string().trim().min(1, "Application ID is required"),
  documentId: z.string().trim().min(1, "Document ID is required"),
});

export const rejectTutorApplicationSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(1, "Rejection reason is required"),
});

export const adminReportsQuerySchema = z.object({
  status: z.enum(reportStatuses, {
    errorMap: () => ({
      message:
        "Status must be PENDING, REVIEWED, ACTION_TAKEN, or DISMISSED",
    }),
  }).optional(),
});

export const reportIdParamSchema = z.object({
  reportId: z.string().trim().min(1, "Report ID is required"),
});

export const updateReportSchema = z.object({
  status: z.enum(["REVIEWED", "ACTION_TAKEN", "DISMISSED"], {
    errorMap: () => ({
      message:
        "Status must be REVIEWED, ACTION_TAKEN, or DISMISSED",
    }),
  }),
});

export const userIdParamSchema = z.object({
  userId: z.string().trim().min(1, "User ID is required"),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(userStatuses, {
    errorMap: () => ({
      message: "Status must be APPROVED, SUSPENDED, or BANNED",
    }),
  }),
});

export const adminUsersQuerySchema = z.object({
  role: z.enum(["STUDENT", "TUTOR", "ADMIN"]).optional(),
  status: z.enum(["APPROVED", "SUSPENDED", "BANNED", "PENDING"]).optional(),
  search: z.string().trim().optional(),
});

export const reassignTutorSchema = z.object({
  newTutorId: z.string().trim().min(1, "New tutor ID is required"),
  notes: z.string().trim().optional(),
});