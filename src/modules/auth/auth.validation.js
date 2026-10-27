import { z } from "zod";

const gradeLevels = [
  "GRADE_8",
  "GRADE_9",
  "GRADE_10",
  "GRADE_11",
  "GRADE_12",
];

export const registerSchema = z.object({
  role: z.enum(["STUDENT", "TUTOR"]).default("STUDENT"),

  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required"),

  phoneOrEmail: z
    .string()
    .trim()
    .min(1, "Phone or email is required"),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters"),

  gradeLevel: z
    .enum(gradeLevels, {
      errorMap: () => ({
        message: "Grade level must be GRADE_8, GRADE_9, GRADE_10, GRADE_11, or GRADE_12",
      }),
    })
    .optional(),

  regionId: z
    .string()
    .trim()
    .optional(),
}).superRefine((data, ctx) => {
  if (data.role === "STUDENT" && !data.gradeLevel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["gradeLevel"],
      message: "Grade level is required for students",
    });
  }
});

export const loginSchema = z.object({
  phoneOrEmail: z
    .string()
    .trim()
    .min(1, "Phone or email is required"),

  password: z
    .string()
    .min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  phoneOrEmail: z
    .string()
    .trim()
    .min(1, "Phone or email is required"),
});

export const resetPasswordSchema = z.object({
  token: z
    .string()
    .trim()
    .min(1, "Reset token is required"),

  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters"),
});