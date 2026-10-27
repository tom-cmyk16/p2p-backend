import { z } from "zod";
import { learningGrades } from "./learning.rules.js";

export const createCourseSchema = z.object({
  subjectId: z.string().trim().min(1, "Subject ID is required"),
  gradeLevel: z.enum(learningGrades),
  isCore: z.boolean().default(true),
  contentAccessDays: z.coerce.number().int().positive().default(30).optional(),
  mentorshipDurationDays: z.coerce.number().int().positive().default(7).optional(),
});

export const updateCourseSchema = createCourseSchema;

export const courseIdParamsSchema = z.object({
  courseId: z.string().trim().min(1, "Course ID is required"),
});

const externalUrl = z.string().trim().url().max(2048).refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "https:" || protocol === "http:";
}, "Material URL must use HTTP or HTTPS");

export const createLearningMaterialSchema = z.object({
  courseId: z.string().trim().min(1, "Course is required"),
  topicId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1, "Material title is required").max(200),
  description: z.string().trim().max(2000).optional(),
  url: externalUrl,
  isPublished: z.boolean().default(true),
});

export const updateLearningMaterialSchema = createLearningMaterialSchema;

export const learningMaterialIdParamsSchema = z.object({
  materialId: z.string().trim().min(1, "Material ID is required"),
});

export const studentMaterialsQuerySchema = z.object({
  courseId: z.string().trim().min(1, "Course ID is required"),
});

export const provisionPackageSchema = z
  .object({
    studentId: z.string().trim().min(1, "Student ID is required"),
    packageType: z.enum([
      "SINGLE_COURSE",
      "FULL_GRADE",
      "ENTRANCE_GRADE_9_12",
    ]),
    courseId: z.string().trim().min(1).optional(),
    gradeLevel: z.enum(learningGrades).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.packageType === "SINGLE_COURSE" && !data.courseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["courseId"],
        message: "A course is required for a single-course package",
      });
    }
    if (data.packageType === "FULL_GRADE" && !data.gradeLevel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gradeLevel"],
        message: "A grade is required for a full-grade package",
      });
    }
    if (
      data.packageType !== "SINGLE_COURSE" &&
      data.packageType !== "FULL_GRADE" &&
      (data.courseId || data.gradeLevel)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["packageType"],
        message: "The entrance package includes Grades 9 to 12 and does not accept a course or grade",
      });
    }
    if (data.packageType === "FULL_GRADE" && data.courseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["courseId"],
        message: "A full-grade package does not accept a single course",
      });
    }
    if (data.packageType === "SINGLE_COURSE" && data.gradeLevel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gradeLevel"],
        message: "The selected course determines the package grade",
      });
    }
  });

export const courseCompletionSchema = z.object({
  completed: z.boolean(),
});

export const studentCourseParamsSchema = z.object({
  studentId: z.string().trim().min(1, "Student ID is required"),
  courseId: z.string().trim().min(1, "Course ID is required"),
});
