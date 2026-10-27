import { z } from "zod";

const tutorEducationLevels = [
  "HIGH_SCHOOL",
  "UNIVERSITY",
];

const gradeLevels = [
  "GRADE_8",
  "GRADE_9",
  "GRADE_10",
  "GRADE_11",
  "GRADE_12",
];

const documentTypes = [
  "NATIONAL_ID",
  "STUDENT_ID_CARD",
  "TRANSCRIPT",
  "CERTIFICATE",
  "RECOMMENDATION_LETTER",
  "OTHER",
];

export const createTutorApplicationSchema = z
  .object({
    educationLevel: z.enum(tutorEducationLevels, {
      errorMap: () => ({
        message:
          "Select high school or university education",
      }),
    }),

    institutionName: z
      .string()
      .trim()
      .min(1, "Institution name is required"),

    currentGradeLevel: z
      .enum(gradeLevels, {
        errorMap: () => ({
          message:
            "Select a valid grade level",
        }),
      })
      .optional(),

    fieldOfStudy: z
      .string()
      .trim()
      .min(1, "Field of study cannot be empty")
      .optional(),

    yearOfStudy: z.preprocess(
      (value) => value === undefined || value === "" ? undefined : Number(value),
      z
        .number({
          invalid_type_error: "Year of study must be a number",
        })
        .int("Year of study must be an integer")
        .positive("Year of study must be greater than 0")
        .optional()
    ),

    bio: z
      .string()
      .trim()
      .min(1, "Bio is required"),
  })
  .superRefine((data, ctx) => {
    if (data.educationLevel === "HIGH_SCHOOL") {
      if (!data.currentGradeLevel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["currentGradeLevel"],
          message:
            "Current grade level is required for high school education",
        });
      }
    }

    if (data.educationLevel !== "HIGH_SCHOOL") {
      if (!data.fieldOfStudy) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fieldOfStudy"],
          message:
            "Field of study is required for university education",
        });
      }

    }
  });

export const uploadTutorDocumentSchema = z.object({
  documentType: z.enum(documentTypes, {
    errorMap: () => ({
      message:
        "Select a valid tutor qualification document type",
    }),
  }),
});