import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";
import { assertCourseAccess } from "../learning/learning.rules.js";

export const normalizeGrade = (val) => {
  if (!val) return null;
  const s = String(val).toUpperCase().replace(/[\s_-]+/g, "");
  if (s === "8" || s === "GRADE8") return "GRADE_8";
  if (s === "9" || s === "GRADE9") return "GRADE_9";
  if (s === "10" || s === "GRADE10") return "GRADE_10";
  if (s === "11" || s === "GRADE11") return "GRADE_11";
  if (s === "12" || s === "GRADE12") return "GRADE_12";
  return String(val).toUpperCase().trim();
};

export const normalizeSubjectName = (name) => {
  if (!name) return "";
  const s = String(name).toLowerCase().trim();
  if (s === "math" || s === "maths" || s === "mathematics") return "mathematics";
  return s;
};

export const listExams = async ({ gradeLevel, subjectId, courseId, isPublished, studentId }) => {
  const whereClause = {};

  if (gradeLevel && gradeLevel !== "ALL") {
    whereClause.gradeLevel = normalizeGrade(gradeLevel);
  }

  if (subjectId && subjectId !== "ALL") {
    whereClause.subjectId = subjectId;
  }

  if (isPublished !== undefined && isPublished !== null && isPublished !== "") {
    whereClause.isPublished =
      typeof isPublished === "string"
        ? isPublished.toLowerCase() === "true" || isPublished === "1"
        : Boolean(isPublished);
  }

  let exams = await prisma.exam.findMany({
    where: whereClause,
    include: {
      subject: { select: { id: true, name: true } },
      questions: {
        include: {
          options: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (studentId) {
    const accessibleExams = [];
    for (const exam of exams) {
      try {
        await assertCourseAccess(prisma, {
          studentId,
          gradeLevel: exam.gradeLevel,
          subjectId: exam.subjectId,
        });
        accessibleExams.push({
          ...exam,
          isLocked: false,
          questionsCount: exam.questions ? exam.questions.length : 0,
          questions: undefined, // Strip answers for students
        });
      } catch {
        // If access is denied by learning rules, skip or mark locked
      }
    }
    return accessibleExams;
  }

  return exams.map((exam) => ({
    ...exam,
    questionsCount: exam.questions ? exam.questions.length : 0,
  }));
};

export const getExamById = async (examId, { studentId = null } = {}) => {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      subject: { select: { id: true, name: true } },
      questions: {
        include: {
          options: true,
        },
      },
    },
  });

  if (!exam) {
    throw new AppError(404, "NOT_FOUND", "Exam not found");
  }

  if (studentId) {
    // Enforce package and progression rules via learning.rules.js
    await assertCourseAccess(prisma, {
      studentId,
      gradeLevel: exam.gradeLevel,
      subjectId: exam.subjectId,
    });

    const sanitizedQuestions = (exam.questions || []).map((q) => ({
      id: q.id,
      questionText: q.questionText,
      gradeLevel: q.gradeLevel,
      topicId: q.topicId,
      options: (q.options || []).map((opt) => ({
        id: opt.id,
        optionText: opt.optionText,
      })),
    }));

    return {
      ...exam,
      isLocked: false,
      questions: sanitizedQuestions,
      questionsCount: sanitizedQuestions.length,
    };
  }

  return {
    ...exam,
    questionsCount: exam.questions ? exam.questions.length : 0,
  };
};

export const createExam = async ({
  title,
  gradeLevel,
  subjectId,
  topicIds = [],
  durationMinutes = 60,
  passingScore = 60,
  instructions = "",
  isPublished = true,
  questions = [],
  createdById = null,
}) => {
  if (!title?.trim()) {
    throw new AppError(422, "VALIDATION_ERROR", "Exam title is required");
  }
  if (!subjectId) {
    throw new AppError(422, "VALIDATION_ERROR", "Subject is required");
  }
  if (!gradeLevel) {
    throw new AppError(422, "VALIDATION_ERROR", "Grade level is required");
  }

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true, name: true },
  });
  if (!subject) {
    throw new AppError(404, "NOT_FOUND", "Selected subject not found");
  }

  const formattedQuestions = (questions || []).map((q, index) => {
    const optionsData = (q.options || []).map((opt, optIdx) => {
      if (typeof opt === "string") {
        return {
          optionText: opt.trim(),
          isCorrect: Number(q.correctOption) === optIdx,
        };
      }
      return {
        optionText: opt.optionText || "",
        isCorrect: Boolean(opt.isCorrect || Number(q.correctOption) === optIdx),
      };
    });

    return {
      questionText: q.questionText?.trim() || `Question ${index + 1}`,
      explanation: q.explanation?.trim() || "",
      gradeLevel,
      topicId: q.topicId || (topicIds.length ? topicIds[0] : null),
      options: {
        create: optionsData,
      },
    };
  });

  const newExam = await prisma.exam.create({
    data: {
      title: title.trim(),
      gradeLevel,
      subjectId,
      durationMinutes: Number(durationMinutes) || 60,
      passingScore: Number(passingScore) || 60,
      instructions: instructions?.trim() || "Answer all questions within the allocated time.",
      isPublished: Boolean(isPublished),
      createdById,
      questions: {
        create: formattedQuestions,
      },
    },
    include: {
      subject: { select: { id: true, name: true } },
      questions: { include: { options: true } },
    },
  });

  return {
    ...newExam,
    questionsCount: newExam.questions.length,
  };
};

export const updateExam = async (examId, payload) => {
  const updated = await prisma.exam.update({
    where: { id: examId },
    data: {
      ...payload,
      durationMinutes: payload.durationMinutes !== undefined ? Number(payload.durationMinutes) : undefined,
      passingScore: payload.passingScore !== undefined ? Number(payload.passingScore) : undefined,
    },
    include: {
      subject: { select: { id: true, name: true } },
      questions: { include: { options: true } },
    },
  });

  return {
    ...updated,
    questionsCount: updated.questions ? updated.questions.length : 0,
  };
};

export const deleteExam = async (examId) => {
  await prisma.exam.delete({
    where: { id: examId },
  });
  return { success: true, message: "Exam deleted successfully" };
};

export const addQuestionToExam = async (examId, questionData) => {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) {
    throw new AppError(404, "NOT_FOUND", "Exam not found");
  }

  if (!questionData.questionText?.trim()) {
    throw new AppError(422, "VALIDATION_ERROR", "Question text is required");
  }

  const optionsData = (questionData.options || []).map((opt, idx) => ({
    optionText: typeof opt === "string" ? opt.trim() : (opt.optionText || "").trim(),
    isCorrect: Number(questionData.correctOption) === idx || Boolean(opt.isCorrect),
  }));

  if (optionsData.length < 2) {
    throw new AppError(422, "VALIDATION_ERROR", "At least two options are required");
  }

  const newQuestion = await prisma.question.create({
    data: {
      examId,
      questionText: questionData.questionText.trim(),
      explanation: questionData.explanation?.trim() || "",
      gradeLevel: questionData.gradeLevel || exam.gradeLevel,
      topicId: questionData.topicId || null,
      options: {
        create: optionsData,
      },
    },
    include: { options: true },
  });

  return newQuestion;
};

export const updateExamQuestion = async (examId, questionId, questionData) => {
  const question = await prisma.question.findFirst({
    where: { id: questionId, examId },
  });

  if (!question) {
    throw new AppError(404, "NOT_FOUND", "Question not found in this exam");
  }

  if (questionData.options) {
    await prisma.option.deleteMany({ where: { questionId } });
  }

  const optionsData = questionData.options
    ? questionData.options.map((opt, idx) => ({
        optionText: typeof opt === "string" ? opt.trim() : (opt.optionText || "").trim(),
        isCorrect: Number(questionData.correctOption) === idx || Boolean(opt.isCorrect),
      }))
    : undefined;

  const updatedQ = await prisma.question.update({
    where: { id: questionId },
    data: {
      questionText: questionData.questionText?.trim() || undefined,
      explanation: questionData.explanation !== undefined ? questionData.explanation.trim() : undefined,
      topicId: questionData.topicId !== undefined ? questionData.topicId : undefined,
      options: optionsData ? { create: optionsData } : undefined,
    },
    include: { options: true },
  });

  return updatedQ;
};

export const deleteExamQuestion = async (examId, questionId) => {
  const question = await prisma.question.findFirst({
    where: { id: questionId, examId },
  });

  if (!question) {
    throw new AppError(404, "NOT_FOUND", "Question not found in this exam");
  }

  await prisma.question.delete({ where: { id: questionId } });
  return { success: true, message: "Question removed from exam" };
};

export const bulkAddQuestionsToExam = async (examId, questions) => {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) {
    throw new AppError(404, "NOT_FOUND", "Exam not found");
  }

  if (!Array.isArray(questions) || !questions.length) {
    throw new AppError(422, "VALIDATION_ERROR", "Questions array is required");
  }

  for (const q of questions) {
    const optionsData = (q.options || []).map((opt, optIdx) => ({
      optionText: typeof opt === "string" ? opt.trim() : (opt.optionText || "").trim(),
      isCorrect: Number(q.correctOption) === optIdx || Boolean(opt.isCorrect),
    }));

    await prisma.question.create({
      data: {
        examId,
        questionText: q.questionText?.trim() || "Question",
        explanation: q.explanation?.trim() || "",
        gradeLevel: q.gradeLevel || exam.gradeLevel,
        topicId: q.topicId || null,
        options: { create: optionsData },
      },
    });
  }

  const totalQuestions = await prisma.question.count({ where: { examId } });

  return {
    addedCount: questions.length,
    totalQuestions,
  };
};

export const submitExamAttempt = async ({ examId, studentId, answers = [] }) => {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      subject: { select: { id: true, name: true } },
      questions: { include: { options: true } },
    },
  });

  if (!exam) {
    throw new AppError(404, "NOT_FOUND", "Exam not found");
  }

  // Enforce learning rules and package access
  await assertCourseAccess(prisma, {
    studentId,
    gradeLevel: exam.gradeLevel,
    subjectId: exam.subjectId,
  });

  const answersMap = new Map();
  answers.forEach((ans) => {
    answersMap.set(ans.questionId, ans.selectedOptionId);
  });

  let correctCount = 0;
  const questionsReview = (exam.questions || []).map((q) => {
    const selectedOptionId = answersMap.get(q.id);
    const selectedOption = (q.options || []).find((opt) => opt.id === selectedOptionId);
    const correctOption = (q.options || []).find((opt) => opt.isCorrect);

    const isCorrect = Boolean(selectedOption && correctOption && selectedOption.id === correctOption.id);
    if (isCorrect) correctCount += 1;

    return {
      questionId: q.id,
      questionText: q.questionText,
      selectedOptionId: selectedOptionId || null,
      selectedOptionText: selectedOption ? selectedOption.optionText : "Not answered",
      correctOptionText: correctOption ? correctOption.optionText : "",
      isCorrect,
      explanation: q.explanation || "",
    };
  });

  const totalQuestions = (exam.questions || []).length || 1;
  const scorePercent = Math.round((correctCount / totalQuestions) * 100);
  const passed = scorePercent >= (exam.passingScore || 60);

  try {
    const studentProfile = await prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { userId: true },
    });
    if (studentProfile && exam.subjectId) {
      await prisma.quizAttempt.create({
        data: {
          studentId,
          subjectId: exam.subjectId,
          gradeLevel: exam.gradeLevel,
          score: scorePercent,
          completedAt: new Date(),
        },
      });
    }
  } catch (err) {
    console.error("Failed to record db attempt:", err.message);
  }

  return {
    examId,
    examTitle: exam.title,
    gradeLevel: exam.gradeLevel,
    subjectName: exam.subject?.name || "",
    score: scorePercent,
    correctCount,
    totalQuestions,
    passed,
    passingScore: exam.passingScore || 60,
    answers: questionsReview,
    submittedAt: new Date().toISOString(),
  };
};
