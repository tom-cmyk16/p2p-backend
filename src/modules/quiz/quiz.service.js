import { randomUUID } from "node:crypto";
import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";
import { assertCourseAccess } from "../learning/learning.rules.js";

const handleUniqueConstraintError = (error, message) => {
  if (error?.code === "P2002") {
    throw new AppError(409, "CONFLICT", message);
  }

  throw error;
};

export const createSubject = async ({ name }) => {
  try {
    return await prisma.subject.create({
      data: { name },
      select: {
        id: true,
        name: true,
      },
    });
  } catch (error) {
    handleUniqueConstraintError(error, "A subject with this name already exists");
  }
};

export const updateSubject = async ({ subjectId, name }) => {
  try {
    return await prisma.subject.update({
      where: { id: subjectId },
      data: { name },
      select: { id: true, name: true },
    });
  } catch (error) {
    if (error?.code === "P2025") {
      throw new AppError(404, "NOT_FOUND", "Subject not found");
    }
    handleUniqueConstraintError(error, "A subject with this name already exists");
  }
};

export const deleteSubject = async (subjectId) => {
  const [courseCount, tutorSubjectCount, attemptCount] = await Promise.all([
    prisma.course.count({ where: { subjectId } }),
    prisma.tutorSubject.count({ where: { subjectId } }),
    prisma.quizAttempt.count({ where: { subjectId } }),
  ]);
  if (courseCount || tutorSubjectCount || attemptCount) {
    throw new AppError(
      409,
      "CONTENT_IN_USE",
      "This subject is used by courses, tutor assignments, or quiz history and cannot be deleted"
    );
  }
  try {
    await prisma.subject.delete({ where: { id: subjectId } });
  } catch (error) {
    if (error?.code === "P2025") {
      throw new AppError(404, "NOT_FOUND", "Subject not found");
    }
    throw error;
  }
};

export const createTopic = async ({ subjectId, name }) => {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true },
  });

  if (!subject) {
    throw new AppError(404, "NOT_FOUND", "Subject not found");
  }

  try {
    return await prisma.topic.create({
      data: {
        subjectId,
        name,
      },
      select: {
        id: true,
        subjectId: true,
        name: true,
      },
    });
  } catch (error) {
    handleUniqueConstraintError(
      error,
      "A topic with this name already exists for the selected subject"
    );
  }
};

export const updateTopic = async ({ topicId, subjectId, name }) => {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true },
  });
  if (!subject) {
    throw new AppError(404, "NOT_FOUND", "Subject not found");
  }
  const existing = await prisma.topic.findUnique({
    where: { id: topicId },
    select: { id: true, subjectId: true },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Topic not found");
  if (existing.subjectId !== subjectId) {
    const questionCount = await prisma.question.count({ where: { topicId } });
    if (questionCount) {
      throw new AppError(
        409,
        "TOPIC_IN_USE",
        "A topic with questions cannot be moved to another subject"
      );
    }
  }
  try {
    return await prisma.topic.update({
      where: { id: topicId },
      data: { subjectId, name },
      select: { id: true, subjectId: true, name: true },
    });
  } catch (error) {
    if (error?.code === "P2025") {
      throw new AppError(404, "NOT_FOUND", "Topic not found");
    }
    handleUniqueConstraintError(
      error,
      "A topic with this name already exists for the selected subject"
    );
  }
};

export const deleteTopic = async (topicId) => {
  const questionCount = await prisma.question.count({ where: { topicId } });
  if (questionCount) {
    throw new AppError(
      409,
      "CONTENT_IN_USE",
      "This topic contains questions; move or remove them before deleting the topic"
    );
  }
  try {
    await prisma.topic.delete({ where: { id: topicId } });
  } catch (error) {
    if (error?.code === "P2025") {
      throw new AppError(404, "NOT_FOUND", "Topic not found");
    }
    throw error;
  }
};

export const createQuestion = async ({
  createdById,
  subjectId,
  topicId,
  gradeLevel,
  questionText,
  options,
  correctOption,
  explanation,
}) => {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      subjectId: true,
    },
  });

  if (!topic) {
    throw new AppError(404, "NOT_FOUND", "Topic not found");
  }

  if (topic.subjectId !== subjectId) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "The selected topic does not belong to the selected subject"
    );
  }

  const question = await prisma.question.create({
    data: {
      topicId,
      createdById,
      gradeLevel,
      questionText,
      explanation,
      options: {
        create: options.map((optionText, index) => ({
          optionText,
          isCorrect: index === correctOption,
        })),
      },
    },
    select: {
      id: true,
      topicId: true,
      gradeLevel: true,
      questionText: true,
      explanation: true,
      options: {
        select: {
          id: true,
          optionText: true,
          isCorrect: true,
        },
      },
    },
  });

  return {
    ...question,
    subjectId,
  };
};

export const bulkCreateQuestions = async ({
  createdById,
  subjectId,
  topicId,
  gradeLevel,
  questions,
}) => {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: { id: true, subjectId: true },
  });
  if (!topic) throw new AppError(404, "NOT_FOUND", "Topic not found");
  if (topic.subjectId !== subjectId) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "The selected topic does not belong to the selected subject",
    );
  }

  const rows = questions.map((question) => ({ ...question, id: randomUUID() }));
  const createdQuestions = await prisma.$transaction(async (tx) => {
    await tx.question.createMany({
      data: rows.map(({ id, questionText, explanation }) => ({
        id,
        topicId,
        createdById,
        gradeLevel,
        questionText,
        explanation,
      })),
    });
    await tx.questionOption.createMany({
      data: rows.flatMap(({ id, options, correctOption }) =>
        options.map((optionText, index) => ({
          id: `${id}:${String(index).padStart(2, "0")}`,
          questionId: id,
          optionText,
          isCorrect: index === correctOption,
        })),
      ),
    });
    const created = await tx.question.findMany({
      where: { id: { in: rows.map(({ id }) => id) } },
      select: {
        id: true,
        topicId: true,
        gradeLevel: true,
        questionText: true,
        explanation: true,
        options: {
          select: { id: true, optionText: true, isCorrect: true },
          orderBy: { id: "asc" },
        },
      },
    });
    const originalOrder = new Map(rows.map(({ id }, index) => [id, index]));
    created.sort((first, second) => originalOrder.get(first.id) - originalOrder.get(second.id));
    return created;
  });

  return { createdCount: createdQuestions.length, questions: createdQuestions };
};

const questionManagementSelect = {
  id: true,
  topicId: true,
  gradeLevel: true,
  questionText: true,
  explanation: true,
  isPublished: true,
  createdById: true,
  topic: {
    select: {
      id: true,
      name: true,
      subject: { select: { id: true, name: true } },
    },
  },
  createdBy: { select: { id: true, fullName: true, role: true } },
  options: {
    select: { id: true, optionText: true, isCorrect: true },
    orderBy: { id: "asc" },
  },
  _count: { select: { attemptAnswers: true } },
};

export const listManagedQuestions = async ({ userId, role, subjectId, topicId, gradeLevel }) =>
  prisma.question.findMany({
    where: {
      ...(role === "ADMIN" ? {} : { createdById: userId }),
      ...(gradeLevel ? { gradeLevel } : {}),
      ...(topicId ? { topicId } : {}),
      ...(subjectId ? { topic: { subjectId } } : {}),
    },
    select: questionManagementSelect,
    orderBy: [{ gradeLevel: "asc" }, { topic: { name: "asc" } }, { id: "asc" }],
  });

export const updateQuestion = async ({
  questionId,
  userId,
  role,
  subjectId,
  topicId,
  gradeLevel,
  questionText,
  options,
  correctOption,
  explanation,
}) => {
  const existing = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      createdById: true,
      options: {
        select: { id: true },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Question not found");
  if (role !== "ADMIN" && existing.createdById !== userId) {
    throw new AppError(403, "FORBIDDEN", "You can only update questions you created");
  }

  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: { subjectId: true },
  });
  if (!topic) throw new AppError(404, "NOT_FOUND", "Topic not found");
  if (topic.subjectId !== subjectId) {
    throw new AppError(422, "VALIDATION_ERROR", "The selected topic does not belong to the selected subject");
  }

  const removedOptions = existing.options.slice(options.length);
  if (removedOptions.length) {
    const selectedOptionCount = await prisma.quizAttemptAnswer.count({
      where: { selectedOptionId: { in: removedOptions.map(({ id }) => id) } },
    });
    if (selectedOptionCount) {
      throw new AppError(
        409,
        "QUESTION_OPTIONS_IN_USE",
        "An option selected in quiz history cannot be removed"
      );
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.question.update({
        where: { id: questionId },
        data: {
          topicId,
          gradeLevel,
          questionText,
          explanation,
          options: {
            update: existing.options.slice(0, options.length).map(({ id }, index) => ({
              where: { id },
              data: {
                optionText: options[index],
                isCorrect: index === correctOption,
              },
            })),
            create: options.slice(existing.options.length).map((optionText, index) => ({
              optionText,
              isCorrect: existing.options.length + index === correctOption,
            })),
            ...(removedOptions.length
              ? { deleteMany: { id: { in: removedOptions.map(({ id }) => id) } } }
              : {}),
          },
        },
        select: questionManagementSelect,
      });
      return updated;
    });
  } catch (error) {
    if (error?.code === "P2025") throw new AppError(404, "NOT_FOUND", "Question not found");
    throw error;
  }
};

export const setQuestionPublished = async ({ questionId, userId, role, isPublished }) => {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, createdById: true },
  });
  if (!question) throw new AppError(404, "NOT_FOUND", "Question not found");
  if (role !== "ADMIN" && question.createdById !== userId) {
    throw new AppError(403, "FORBIDDEN", "You can only moderate questions you created");
  }
  return prisma.question.update({
    where: { id: questionId },
    data: { isPublished },
    select: { id: true, isPublished: true },
  });
};

export const listManagedQuizAttempts = async ({ userId, role }) => {
  const questionFilter = role === "ADMIN" ? {} : { createdById: userId };
  return prisma.quizAttempt.findMany({
    where: {
      answers: { some: { question: questionFilter } },
    },
    take: 100,
    select: {
      id: true,
      gradeLevel: true,
      score: true,
      startedAt: true,
      completedAt: true,
      student: { select: { user: { select: { id: true, fullName: true } } } },
      subject: { select: { id: true, name: true } },
      answers: {
        where: { question: questionFilter },
        select: {
          questionId: true,
          selectedOptionId: true,
          selectedOptionText: true,
          correctOptionText: true,
          isCorrect: true,
          question: {
            select: {
              questionText: true,
              explanation: true,
              topic: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });
};

export const getQuizQuestions = async ({ studentId, subjectId, gradeLevel, topicId }) => {
  await assertCourseAccess(prisma, { studentId, subjectId, gradeLevel });
  const questions = await prisma.question.findMany({
    where: {
      isPublished: true,
      gradeLevel,
      topic: {
        subjectId,
        ...(topicId ? { id: topicId } : {}),
      },
    },

    select: {
      id: true,
      questionText: true,

      options: {
        select: {
          id: true,
          optionText: true,
        },
      },
    },

    orderBy: {
      id: "asc",
    },
  });

  return questions;
};

export const submitQuizAttempt = async ({studentId,subjectId, gradeLevel,answers,}) => {
  await assertCourseAccess(prisma, { studentId, subjectId, gradeLevel });
  const studentProfile = await prisma.studentProfile.findUnique({
    where: {
      userId: studentId,
    },
    select: {
      userId: true,
    },
  });

  if (!studentProfile) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "Student profile not found"
    );
  }

  const questionIds = answers.map((answer) => answer.questionId);
  const questions = await prisma.question.findMany({
    where: {
      id: {
        in: questionIds,
      },
      isPublished: true,
    },

    select: {
      id: true,
      topicId: true,
      gradeLevel: true,

      topic: {
        select: {
          subjectId: true,
        },
      },

      options: {
        select: {
          id: true,
          optionText: true,
          isCorrect: true,
        },
      },
    },
  });

  if (questions.length !== questionIds.length) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "One or more questions do not exist"
    );
  }

  for (const question of questions) {
    if (
      question.gradeLevel !== gradeLevel ||
      question.topic.subjectId !== subjectId
    ) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        "All questions must belong to the selected subject and grade level"
      );
    }
  }

  const questionMap = new Map(
    questions.map((question) => [question.id, question])
  );

  const answerResults = answers.map((answer) => {
    const question = questionMap.get(answer.questionId);

    const selectedOption = question.options.find(
      (option) => option.id === answer.selectedOptionId
    );

    if (!selectedOption) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        `Selected option does not belong to question ${answer.questionId}`
      );
    }

    const correctOption = question.options.find(
      (option) => option.isCorrect
    );

    if (!correctOption) {
      throw new AppError(
        500,
        "INTERNAL_ERROR",
        `Question ${question.id} has no correct option configured`
      );
    }

    return {
      questionId: question.id,
      selectedOptionId: selectedOption.id,
      isCorrect: selectedOption.isCorrect,
      correctOptionId: correctOption.id,
    };
  });

  const correctAnswers = answerResults.filter(
    (answer) => answer.isCorrect
  ).length;

  const score = Math.round(
    (correctAnswers / answerResults.length) * 100
  );

  const attempt = await prisma.quizAttempt.create({
    data: {
      studentId,
      subjectId,
      gradeLevel,
      score,

      answers: {
        create: answerResults.map((answer) => ({
          questionId: answer.questionId,
          selectedOptionId: answer.selectedOptionId,
          selectedOptionText: questionMap.get(answer.questionId).options.find(
            (option) => option.id === answer.selectedOptionId
          ).optionText,
          correctOptionText: questionMap.get(answer.questionId).options.find(
            (option) => option.id === answer.correctOptionId
          ).optionText,
          isCorrect: answer.isCorrect,
        })),
      },
    },

    select: {
      id: true,
      score: true,
      startedAt: true,
      completedAt: true,

      answers: {
        select: {
          questionId: true,
          selectedOptionId: true,
          isCorrect: true,
          selectedOptionText: true,
          correctOptionText: true,
        },
      },
    },
  });

  return {
    id: attempt.id,
    score: attempt.score,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,

    answers: attempt.answers.map((answer) => {
      const result = answerResults.find(
        (item) => item.questionId === answer.questionId
      );

      return {
        questionId: answer.questionId,
        selectedOptionId: answer.selectedOptionId,
        isCorrect: answer.isCorrect,
        correctOptionId: result.correctOptionId,
        selectedOptionText: answer.selectedOptionText,
        correctOptionText: answer.correctOptionText,
      };
    }),
  };
};

export const getQuizAttemptHistory = async (studentId) =>
  prisma.quizAttempt.findMany({
    where: { studentId },
    take: 50,
    select: {
      id: true,
      gradeLevel: true,
      score: true,
      startedAt: true,
      completedAt: true,
      subject: { select: { id: true, name: true } },
      answers: {
        select: {
          questionId: true,
          selectedOptionId: true,
          isCorrect: true,
          selectedOptionText: true,
          correctOptionText: true,
          selectedOption: {
            select: { optionText: true },
          },
          question: {
            select: {
              questionText: true,
              explanation: true,
              options: {
                select: {
                  optionText: true,
                  isCorrect: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });

export const getWeakTopics = async (studentId) => {
  const answers = await prisma.quizAttemptAnswer.findMany({
    where: {
      attempt: {
        studentId,
      },
    },

    select: {
      isCorrect: true,

      question: {
        select: {
          topicId: true,

          topic: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  const topicStats = new Map();

  for (const answer of answers) {
    const topicId = answer.question.topicId;

    if (!topicStats.has(topicId)) {
      topicStats.set(topicId, {
        topicId,
        topicName: answer.question.topic.name,
        total: 0,
        correct: 0,
      });
    }

    const stats = topicStats.get(topicId);

    stats.total += 1;

    if (answer.isCorrect) {
      stats.correct += 1;
    }
  }

  return Array.from(topicStats.values())
    .map((topic) => ({
      topicId: topic.topicId,
      topicName: topic.topicName,
      averageScore: Number(
        ((topic.correct / topic.total) * 100).toFixed(1)
      ),
    }))
    .filter((topic) => topic.averageScore < 60);
};