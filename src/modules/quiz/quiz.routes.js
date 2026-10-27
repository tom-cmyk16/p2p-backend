import { Router } from "express";

import { prisma } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/requireRole.middleware.js";
import { AppError } from "../../utils/ApiError.js";
import {
  validate,
  validateParams,
  validateQuery,
} from "../../middlewares/validate.middleware.js";
import {
  createQuizAttempt,
  createQuestion,
  bulkCreateQuestions,
  createSubject,
  createTopic,
  archiveQuestion,
  deleteSubject,
  deleteTopic,
  listManagedAttempts,
  listManagedQuestions,
  listQuizQuestions,
  listQuizAttemptHistory,
  listWeakTopics,
  moderateQuestion,
  updateQuestion,
  updateSubject,
  updateTopic,
  listAllExams,
  getSingleExam,
  createExamHandler,
  updateExamHandler,
  deleteExamHandler,
  addQuestionToExamHandler,
  updateExamQuestionHandler,
  deleteExamQuestionHandler,
  bulkAddExamQuestionsHandler,
  submitExamAttemptHandler,
} from "./quiz.controller.js";
import {
  createQuestionSchema,
  bulkCreateQuestionsSchema,
  createSubjectSchema,
  createTopicSchema,
  quizQuestionsQuerySchema,
  questionIdParamsSchema,
  questionPublishSchema,
  subjectIdParamsSchema,
  topicIdParamsSchema,
  manageQuestionsQuerySchema,
  submitQuizSchema,
  updateQuestionSchema,
  updateSubjectSchema,
  updateTopicSchema,
} from "./quiz.validation.js";

const router = Router();

const requireApprovedTutorOrAdmin = async (req, res, next) => {
  if (req.user.role === "ADMIN") {
    return next();
  }

  if (req.user.role !== "TUTOR") {
    return next(
      new AppError(
        403,
        "FORBIDDEN",
        "Only admins and approved tutors can manage quiz content"
      )
    );
  }

  try {
    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { userId: req.user.id },
      select: { userId: true },
    });

    if (!tutorProfile) {
      return next(
        new AppError(
          403,
          "FORBIDDEN",
          "Only admins and approved tutors can manage quiz content"
        )
      );
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

const contentManagers = [
  authenticate,
  requireRole("ADMIN", "TUTOR"),
  requireApprovedTutorOrAdmin,
];

router.post(
  "/subjects",
  ...contentManagers,
  validate(createSubjectSchema),
  createSubject
);

router.patch(
  "/subjects/:subjectId",
  ...contentManagers,
  validateParams(subjectIdParamsSchema),
  validate(updateSubjectSchema),
  updateSubject
);
router.delete(
  "/subjects/:subjectId",
  ...contentManagers,
  validateParams(subjectIdParamsSchema),
  deleteSubject
);

router.post(
  "/topics",
  ...contentManagers,
  validate(createTopicSchema),
  createTopic
);

router.patch(
  "/topics/:topicId",
  ...contentManagers,
  validateParams(topicIdParamsSchema),
  validate(updateTopicSchema),
  updateTopic
);
router.delete(
  "/topics/:topicId",
  ...contentManagers,
  validateParams(topicIdParamsSchema),
  deleteTopic
);

router.post(
  "/questions",
  ...contentManagers,
  validate(createQuestionSchema),
  createQuestion
);
router.post(
  "/questions/bulk",
  ...contentManagers,
  validate(bulkCreateQuestionsSchema),
  bulkCreateQuestions
);

router.get(
  "/manage/questions",
  ...contentManagers,
  validateQuery(manageQuestionsQuerySchema),
  listManagedQuestions
);
router.get("/manage/attempts", ...contentManagers, listManagedAttempts);
router.patch(
  "/questions/:questionId",
  ...contentManagers,
  validateParams(questionIdParamsSchema),
  validate(updateQuestionSchema),
  updateQuestion
);
router.patch(
  "/questions/:questionId/publish",
  ...contentManagers,
  validateParams(questionIdParamsSchema),
  validate(questionPublishSchema),
  moderateQuestion
);
router.delete(
  "/questions/:questionId",
  ...contentManagers,
  validateParams(questionIdParamsSchema),
  archiveQuestion
);

router.get("/questions", authenticate, requireRole("STUDENT"),
  validateQuery(quizQuestionsQuerySchema),
  listQuizQuestions
);

router.post("/attempts", authenticate, requireRole("STUDENT"),
  validate(submitQuizSchema),
  createQuizAttempt
);

router.get("/attempts", authenticate, requireRole("STUDENT"), listQuizAttemptHistory);

router.get("/weak-topics", authenticate, requireRole("STUDENT"),
  listWeakTopics
);

// Exam routes
// Both Students and Content Managers can list exams (students see locked/unlocked based on subscription)
router.get("/exams", authenticate, listAllExams);
router.get("/exams/:examId", authenticate, getSingleExam);

// Exam creation & management (Admin & Tutor)
router.post("/exams", ...contentManagers, createExamHandler);
router.patch("/exams/:examId", ...contentManagers, updateExamHandler);
router.delete("/exams/:examId", ...contentManagers, deleteExamHandler);

// Manage questions within an exam
router.post("/exams/:examId/questions", ...contentManagers, addQuestionToExamHandler);
router.patch("/exams/:examId/questions/:questionId", ...contentManagers, updateExamQuestionHandler);
router.delete("/exams/:examId/questions/:questionId", ...contentManagers, deleteExamQuestionHandler);
router.post("/exams/:examId/questions/bulk", ...contentManagers, bulkAddExamQuestionsHandler);

// Student Exam Attempt Submission
router.post("/exams/:examId/submit", authenticate, requireRole("STUDENT"), submitExamAttemptHandler);

export default router;