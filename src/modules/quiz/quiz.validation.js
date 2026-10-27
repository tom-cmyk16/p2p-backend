import { z } from "zod";

const gradeLevels = ["GRADE_8", "GRADE_9", "GRADE_10", "GRADE_11", "GRADE_12"];

export const createSubjectSchema = z.object({
  name: z.string().trim().min(1, "Subject name is required").max(100),
});

export const createTopicSchema = z.object({
  subjectId: z.string().trim().min(1, "Subject ID is required"),
  name: z.string().trim().min(1, "Topic name is required").max(100),
});

export const updateSubjectSchema = createSubjectSchema;

export const updateTopicSchema = createTopicSchema;

export const subjectIdParamsSchema = z.object({
  subjectId: z.string().trim().min(1, "Subject ID is required"),
});

export const topicIdParamsSchema = z.object({
  topicId: z.string().trim().min(1, "Topic ID is required"),
});

export const questionIdParamsSchema = z.object({
  questionId: z.string().trim().min(1, "Question ID is required"),
});

export const manageQuestionsQuerySchema = z.object({
  subjectId: z.string().trim().min(1).optional(),
  topicId: z.string().trim().min(1).optional(),
  gradeLevel: z.enum(gradeLevels).optional(),
});

export const questionPublishSchema = z.object({
  isPublished: z.boolean(),
});

const questionContentSchema = z.object({
    subjectId: z.string().trim().min(1, "Subject ID is required"),
    topicId: z.string().trim().min(1, "Topic ID is required"),
    gradeLevel: z.enum(gradeLevels, {
      errorMap: () => ({
        message: "Select a valid grade level",
      }),
    }),
    questionText: z.string().trim().min(1, "Question text is required").max(5000),
    options: z
      .array(z.string().trim().min(1, "Option text is required").max(1000))
      .min(2, "At least two options are required")
      .max(6, "No more than six options are allowed"),
    correctOption: z.coerce
      .number()
      .int("Correct option must be an option index")
      .min(0, "Correct option index cannot be negative"),
    explanation: z.string().trim().min(1, "Explanation is required").max(5000),
}).superRefine((data, ctx) => {
    if (data.correctOption >= data.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correctOption"],
        message: "Correct option index must reference an option",
      });
    }

    if (new Set(data.options).size !== data.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Answer options must be unique",
      });
    }
  });

export const createQuestionSchema = questionContentSchema;
export const updateQuestionSchema = questionContentSchema;

const bulkQuestionSchema = z.object({
  questionText: z.string().trim().min(1, "Question text is required").max(5000),
  options: z
    .array(z.string().trim().min(1, "Option text is required").max(1000))
    .min(2, "At least two options are required")
    .max(6, "No more than six options are allowed"),
  correctOption: z.number().int().min(0),
  explanation: z.string().trim().min(1, "Explanation is required").max(5000),
}).superRefine((data, ctx) => {
  if (data.correctOption >= data.options.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["correctOption"],
      message: "Correct option index must reference an option",
    });
  }
  if (new Set(data.options).size !== data.options.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["options"],
      message: "Answer options must be unique",
    });
  }
});

export const bulkCreateQuestionsSchema = z.object({
  subjectId: z.string().trim().min(1, "Subject ID is required"),
  topicId: z.string().trim().min(1, "Topic ID is required"),
  gradeLevel: z.enum(gradeLevels),
  questions: z.array(bulkQuestionSchema)
    .min(50, "Import must contain at least 50 questions")
    .max(100, "Import cannot contain more than 100 questions"),
});

export const quizQuestionsQuerySchema = z.object({
  subjectId: z.string().trim().min(1, "Subject ID is required"),

  gradeLevel: z.enum(gradeLevels, {
    errorMap: () => ({
      message: "Select a valid grade level",
    }),
  }),

  topicId: z.string().trim().min(1).optional(),
});

const quizAnswerSchema = z.object({
  questionId: z.string().trim().min(1, "Question ID is required"),

  selectedOptionId: z
    .string()
    .trim()
    .min(1, "Selected option ID is required"),
});

export const submitQuizSchema = z
  .object({
    subjectId: z.string().trim().min(1, "Subject ID is required"),

    gradeLevel: z.enum(gradeLevels, {
      errorMap: () => ({
        message: "Select a valid grade level",
      }),
    }),

    answers: z
      .array(quizAnswerSchema)
      .min(1, "At least one answer is required"),
  })
  .superRefine((data, ctx) => {
    const questionIds = data.answers.map((answer) => answer.questionId);

    if (new Set(questionIds).size !== questionIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answers"],
        message: "Each question can only be answered once",
      });
    }
  });