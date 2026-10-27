import { z } from "zod";
import { learningGrades } from "../learning/learning.rules.js";

const packageType = z.enum([
  "SINGLE_COURSE",
  "FULL_GRADE",
  "ENTRANCE_GRADE_9_12",
]);

export const tutorQuerySchema = z.object({
  packageType,
  courseId: z.string().trim().min(1).optional(),
  gradeLevel: z.enum(learningGrades).optional(),
}).superRefine((value, ctx) => {
  if (value.packageType === "SINGLE_COURSE" && (!value.courseId || value.gradeLevel)) {
    ctx.addIssue({
      code: "custom",
      path: ["courseId"],
      message: "Select the course for a single-course package",
    });
  }
  if (value.packageType === "FULL_GRADE" && (!value.gradeLevel || value.courseId)) {
    ctx.addIssue({
      code: "custom",
      path: ["gradeLevel"],
      message: "Select the grade for a full-grade package",
    });
  }
  if (value.packageType === "ENTRANCE_GRADE_9_12" && (value.gradeLevel || value.courseId)) {
    ctx.addIssue({
      code: "custom",
      path: ["packageType"],
      message: "The entrance package does not accept a course or grade",
    });
  }
});

export const checkoutSchema = z.object({
  offerId: z.string().trim().min(1),
  tutorId: z.string().trim().min(1),
  email: z.string().trim().email(),
  phoneNumber: z.string().trim().regex(/^(09|07)\d{8}$/).optional(),
});

export const updateOfferSchema = z.object({
  packageType,
  courseId: z.string().trim().min(1).optional(),
  gradeLevel: z.enum(learningGrades).optional(),
  amount: z.coerce.number().finite().positive().max(10000000)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, {
      message: "Price must use no more than two decimal places",
    }).optional(),
  pricingMode: z.enum(["STANDARD", "CUSTOM"]).optional(),
  standardAmount: z.coerce.number().finite().positive().max(10000000)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, {
      message: "Standard price must use no more than two decimal places",
    }).optional(),
  customAmount: z.coerce.number().finite().positive().max(10000000)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, {
      message: "Custom price must use no more than two decimal places",
    }).optional(),
  contentAccessDays: z.coerce.number().int().positive().optional(),
  mentorshipDurationDays: z.coerce.number().int().positive().optional(),
  active: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.packageType === "SINGLE_COURSE" && (!value.courseId || value.gradeLevel)) {
    ctx.addIssue({
      code: "custom",
      path: ["courseId"],
      message: "A single-course offer requires a course and no grade",
    });
  }
  if (value.packageType === "FULL_GRADE" && (!value.gradeLevel || value.courseId)) {
    ctx.addIssue({
      code: "custom",
      path: ["gradeLevel"],
      message: "A full-grade offer requires a grade and no course",
    });
  }
  if (value.packageType === "ENTRANCE_GRADE_9_12" && (value.gradeLevel || value.courseId)) {
    ctx.addIssue({
      code: "custom",
      path: ["packageType"],
      message: "The entrance offer does not accept a course or grade",
    });
  }
  if (!value.pricingMode && value.amount === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["amount"],
      message: "A package price is required",
    });
  }
  if (value.pricingMode && value.standardAmount === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["standardAmount"],
      message: "A standard price is required",
    });
  }
  if (value.pricingMode === "CUSTOM" && value.customAmount === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["customAmount"],
      message: "A custom price is required in custom pricing mode",
    });
  }
});

export const commissionSchema = z.object({
  commissionPercent: z.coerce.number().finite().min(5).max(10)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, {
      message: "Commission rate must use no more than two decimal places",
    }),
});

export const payoutParamsSchema = z.object({
  payoutId: z.string().trim().min(1),
});

export const markPayoutPaidSchema = z.object({
  payoutReference: z.string().trim().min(1).max(120),
});

export const revenueDashboardQuerySchema = z.object({
  paymentPage: z.coerce.number().int().min(1).max(100000).default(1),
  payoutPage: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(10).max(50).default(25),
});

export const paymentRefParamsSchema = z.object({
  txRef: z.string().trim().min(1),
});
