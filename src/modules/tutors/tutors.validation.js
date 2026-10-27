import { z } from "zod";

const gradeLevels = ["GRADE_8", "GRADE_9", "GRADE_10", "GRADE_11", "GRADE_12"];

export const tutorListQuerySchema = z.object({
  subjectId: z.string().trim().min(1).optional(),
  gradeLevel: z
    .enum(gradeLevels, {
      errorMap: () => ({
        message: "Select a valid grade level",
      }),
    })
    .optional(),
  regionId: z.string().trim().min(1).optional(),
});

export const subjectIdParamSchema = z.object({
  subjectId: z.string().trim().min(1, "Subject ID is required"),
});

export const tutorIdParamSchema = z.object({
  tutorId: z.string().trim().min(1, "Tutor ID is required"),
});

export const updateTutorProfileSchema = z.object({
  bio: z.string().trim().min(1, "Bio is required").max(5000),
  institutionName: z
    .string()
    .trim()
    .min(1, "Institution name is required")
    .max(200),
  subjects: z
    .array(
      z.object({
        subjectId: z.string().trim().min(1, "Subject ID is required"),
        gradeLevel: z.enum(gradeLevels, {
          errorMap: () => ({
            message: "Select a valid grade level",
          }),
        }),
      })
    )
    .max(100),
}).strict().superRefine((data, ctx) => {
  const subjectGrades = data.subjects.map(
    ({ subjectId, gradeLevel }) => `${subjectId}:${gradeLevel}`
  );

  if (new Set(subjectGrades).size !== subjectGrades.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["subjects"],
      message: "Subject and grade level combinations must be unique",
    });
  }
});