import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";
import { assertCourseAccess } from "../learning/learning.rules.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../data");
const EXAMS_FILE = path.join(DATA_DIR, "exams.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadExamsFromFile() {
  ensureDataDir();
  if (!fs.existsSync(EXAMS_FILE)) {
    // Initial sample exams if empty
    const initialExams = [
      {
        id: "exam_g9_math_mock_1",
        title: "Grade 9 Mathematics Comprehensive Mock Exam",
        gradeLevel: "GRADE_9",
        subjectId: "", // Will link dynamically to math subject
        subjectName: "Mathematics",
        topicIds: [],
        durationMinutes: 60,
        passingScore: 60,
        instructions: "Answer all questions. Each question has four options with exactly one correct answer. No calculators allowed.",
        isPublished: true,
        createdById: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        questions: [
          {
            id: "q_m9_1",
            questionText: "If 2x + 5 = 17, what is the value of 3x - 1?",
            options: [
              { id: "opt_1", optionText: "17", isCorrect: true },
              { id: "opt_2", optionText: "18", isCorrect: false },
              { id: "opt_3", optionText: "12", isCorrect: false },
              { id: "opt_4", optionText: "15", isCorrect: false },
            ],
            explanation: "2x = 12 => x = 6. Then 3(6) - 1 = 18 - 1 = 17.",
            gradeLevel: "GRADE_9",
          },
          {
            id: "q_m9_2",
            questionText: "What is the slope of the line passing through points (2, 3) and (6, 11)?",
            options: [
              { id: "opt_5", optionText: "2", isCorrect: true },
              { id: "opt_6", optionText: "4", isCorrect: false },
              { id: "opt_7", optionText: "1/2", isCorrect: false },
              { id: "opt_8", optionText: "3", isCorrect: false },
            ],
            explanation: "Slope m = (11 - 3) / (6 - 2) = 8 / 4 = 2.",
            gradeLevel: "GRADE_9",
          },
          {
            id: "q_m9_3",
            questionText: "Which of the following is a prime number?",
            options: [
              { id: "opt_9", optionText: "29", isCorrect: true },
              { id: "opt_10", optionText: "27", isCorrect: false },
              { id: "opt_11", optionText: "21", isCorrect: false },
              { id: "opt_12", optionText: "33", isCorrect: false },
            ],
            explanation: "29 has no divisors other than 1 and 29.",
            gradeLevel: "GRADE_9",
          },
        ],
      },
    ];
    fs.writeFileSync(EXAMS_FILE, JSON.stringify(initialExams, null, 2), "utf-8");
    return initialExams;
  }

  try {
    const raw = fs.readFileSync(EXAMS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveExamsToFile(exams) {
  ensureDataDir();
  fs.writeFileSync(EXAMS_FILE, JSON.stringify(exams, null, 2), "utf-8");
}

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

export const checkStudentExamAccess = (enrollments, exam) => {
  if (!Array.isArray(enrollments) || enrollments.length === 0) return false;

  const examGrade = normalizeGrade(exam.gradeLevel);
  const examSubId = exam.subjectId;
  const examSubName = normalizeSubjectName(exam.subjectName || exam.title);

  return enrollments.some((en) => {
    // 1. Entrance package (Grade 9-12): covers all subjects in Grade 9-12
    if (en.packageType === "ENTRANCE_GRADE_9_12") {
      return true;
    }

    const enGrade = normalizeGrade(en.gradeLevel || en.course?.gradeLevel);

    // 2. Full grade package: covers all subjects for that grade
    if (en.packageType === "FULL_GRADE") {
      return !enGrade || !examGrade || enGrade === examGrade;
    }

    // 3. Single course package: flexible course/subject and grade matching
    if (en.packageType === "SINGLE_COURSE") {
      const gradeMatches = !enGrade || !examGrade || enGrade === examGrade;
      if (!gradeMatches) return false;

      const courseSubId = en.course?.subjectId;
      const courseId = en.courseId || en.course?.id;
      const courseSubName = normalizeSubjectName(en.course?.subject?.name);

      const idMatches =
        Boolean(examSubId && (examSubId === courseSubId || examSubId === courseId)) ||
        Boolean(exam.courseId && (exam.courseId === courseId || exam.courseId === courseSubId));

      const nameMatches =
        Boolean(courseSubName && examSubName) &&
        (examSubName === courseSubName ||
          examSubName.includes(courseSubName) ||
          courseSubName.includes(examSubName));

      // Flexible fallback when no strict subject is declared
      const openMatches = !examSubId && !examSubName;

      return idMatches || nameMatches || openMatches;
    }

    return Boolean(enGrade && examGrade && enGrade === examGrade);
  });
};

export const listExams = async ({ gradeLevel, subjectId, courseId, isPublished, studentId }) => {
  const allExams = loadExamsFromFile();
  const subjects = await prisma.subject.findMany({ select: { id: true, name: true } });
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));

  // Resolve subject ids dynamically if missing
  allExams.forEach((exam) => {
    const examSubNorm = normalizeSubjectName(exam.subjectName || exam.title);
    if (!exam.subjectId && examSubNorm) {
      const match = subjects.find((s) => normalizeSubjectName(s.name) === examSubNorm);
      if (match) exam.subjectId = match.id;
    }
    if (exam.subjectId && !exam.subjectName) {
      exam.subjectName = subjectMap.get(exam.subjectId) || "General Subject";
    }
  });

  // Resolve courseId if provided in query
  if (courseId) {
    try {
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { subjectId: true, gradeLevel: true },
      });
      if (course) {
        if (!subjectId) subjectId = course.subjectId;
        if (!gradeLevel) gradeLevel = course.gradeLevel;
      }
    } catch {
      // ignore course lookup error
    }
  }

  let filtered = allExams;

  // Filter by gradeLevel flexibly
  if (gradeLevel && gradeLevel !== "ALL") {
    const targetGrade = normalizeGrade(gradeLevel);
    filtered = filtered.filter((e) => {
      const eg = normalizeGrade(e.gradeLevel);
      return !targetGrade || !eg || eg === targetGrade;
    });
  }

  // Filter by subjectId flexibly
  if (subjectId && subjectId !== "ALL") {
    filtered = filtered.filter((e) => {
      if (e.subjectId === subjectId) return true;
      if (e.courseId === subjectId) return true;
      const matchedSubject = subjects.find((s) => s.id === subjectId);
      if (matchedSubject) {
        return normalizeSubjectName(e.subjectName) === normalizeSubjectName(matchedSubject.name);
      }
      return false;
    });
  }

  // Filter by isPublished flexibly (handles boolean or string "true" / "false")
  if (isPublished !== undefined && isPublished !== null && isPublished !== "") {
    const targetPublished =
      typeof isPublished === "string"
        ? isPublished.toLowerCase() === "true" || isPublished === "1"
        : Boolean(isPublished);
    filtered = filtered.filter((e) => Boolean(e.isPublished) === targetPublished);
  }

  // If studentId provided, compute locking status flexibly based on active enrollments
  if (studentId) {
    const now = new Date();
    const enrollments = await prisma.packageEnrollment.findMany({
      where: {
        studentId,
        startedAt: { lte: now },
        accessExpiresAt: { gt: now },
      },
      select: {
        id: true,
        packageType: true,
        gradeLevel: true,
        courseId: true,
        course: {
          select: {
            id: true,
            subjectId: true,
            gradeLevel: true,
            subject: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Strictly return only examinations unlocked by student's active package enrollments
    return filtered
      .filter((exam) => checkStudentExamAccess(enrollments, exam))
      .map((exam) => ({
        ...exam,
        isLocked: false,
        questionsCount: exam.questions ? exam.questions.length : 0,
        // Strip correct answer flags for student list
        questions: undefined,
      }));
  }

  return filtered.map((exam) => ({
    ...exam,
    questionsCount: exam.questions ? exam.questions.length : 0,
  }));
};

export const getExamById = async (examId, { studentId = null } = {}) => {
  const allExams = loadExamsFromFile();
  const exam = allExams.find((e) => e.id === examId);
  if (!exam) {
    throw new AppError(404, "NOT_FOUND", "Exam not found");
  }

  const subjects = await prisma.subject.findMany({ select: { id: true, name: true } });
  const examSubNorm = normalizeSubjectName(exam.subjectName || exam.title);
  const matchedSubject = subjects.find(
    (s) => s.id === exam.subjectId || normalizeSubjectName(s.name) === examSubNorm
  );
  if (matchedSubject) {
    exam.subjectId = matchedSubject.id;
    exam.subjectName = matchedSubject.name;
  }

  if (studentId) {
    const now = new Date();
    const enrollments = await prisma.packageEnrollment.findMany({
      where: {
        studentId,
        startedAt: { lte: now },
        accessExpiresAt: { gt: now },
      },
      select: {
        id: true,
        packageType: true,
        gradeLevel: true,
        courseId: true,
        course: {
          select: {
            id: true,
            subjectId: true,
            gradeLevel: true,
            subject: { select: { id: true, name: true } },
          },
        },
      },
    });

    const hasAccess = checkStudentExamAccess(enrollments, exam);

    if (!hasAccess) {
      throw new AppError(
        403,
        "PACKAGE_ACCESS_REQUIRED",
        "Access to this exam requires an active paid course or package subscription."
      );
    }

    // Return questions WITHOUT isCorrect / explanation during active exam taking
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

  const allExams = loadExamsFromFile();
  const examId = `exam_${randomUUID()}`;

  // Normalize questions
  const formattedQuestions = (questions || []).map((q, index) => {
    const qId = q.id || `q_${randomUUID()}`;
    const options = (q.options || []).map((opt, optIdx) => {
      if (typeof opt === "string") {
        return {
          id: `opt_${randomUUID()}`,
          optionText: opt.trim(),
          isCorrect: Number(q.correctOption) === optIdx,
        };
      }
      return {
        id: opt.id || `opt_${randomUUID()}`,
        optionText: opt.optionText || "",
        isCorrect: Boolean(opt.isCorrect || Number(q.correctOption) === optIdx),
      };
    });

    return {
      id: qId,
      questionText: q.questionText?.trim() || `Question ${index + 1}`,
      options,
      explanation: q.explanation?.trim() || "",
      gradeLevel,
      topicId: q.topicId || (topicIds.length ? topicIds[0] : null),
      createdAt: new Date().toISOString(),
    };
  });

  const newExam = {
    id: examId,
    title: title.trim(),
    gradeLevel,
    subjectId,
    subjectName: subject.name,
    topicIds: Array.isArray(topicIds) ? topicIds : [],
    durationMinutes: Number(durationMinutes) || 60,
    passingScore: Number(passingScore) || 60,
    instructions: instructions?.trim() || "Answer all questions within the allocated time.",
    isPublished: Boolean(isPublished),
    createdById,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questions: formattedQuestions,
  };

  allExams.unshift(newExam);
  saveExamsToFile(allExams);

  return {
    ...newExam,
    questionsCount: newExam.questions.length,
  };
};

export const updateExam = async (examId, payload) => {
  const allExams = loadExamsFromFile();
  const examIndex = allExams.findIndex((e) => e.id === examId);
  if (examIndex === -1) {
    throw new AppError(404, "NOT_FOUND", "Exam not found");
  }

  const current = allExams[examIndex];
  let subjectName = current.subjectName;
  if (payload.subjectId && payload.subjectId !== current.subjectId) {
    const subject = await prisma.subject.findUnique({
      where: { id: payload.subjectId },
      select: { name: true },
    });
    if (subject) subjectName = subject.name;
  }

  const updated = {
    ...current,
    ...payload,
    subjectName: payload.subjectId ? subjectName : current.subjectName,
    durationMinutes: payload.durationMinutes !== undefined ? Number(payload.durationMinutes) : current.durationMinutes,
    passingScore: payload.passingScore !== undefined ? Number(payload.passingScore) : current.passingScore,
    updatedAt: new Date().toISOString(),
  };

  allExams[examIndex] = updated;
  saveExamsToFile(allExams);

  return {
    ...updated,
    questionsCount: updated.questions ? updated.questions.length : 0,
  };
};

export const deleteExam = async (examId) => {
  const allExams = loadExamsFromFile();
  const examIndex = allExams.findIndex((e) => e.id === examId);
  if (examIndex === -1) {
    throw new AppError(404, "NOT_FOUND", "Exam not found");
  }

  allExams.splice(examIndex, 1);
  saveExamsToFile(allExams);
  return { success: true, message: "Exam deleted successfully" };
};

export const addQuestionToExam = async (examId, questionData) => {
  const allExams = loadExamsFromFile();
  const exam = allExams.find((e) => e.id === examId);
  if (!exam) {
    throw new AppError(404, "NOT_FOUND", "Exam not found");
  }

  if (!questionData.questionText?.trim()) {
    throw new AppError(422, "VALIDATION_ERROR", "Question text is required");
  }

  const options = (questionData.options || []).map((opt, idx) => ({
    id: `opt_${randomUUID()}`,
    optionText: typeof opt === "string" ? opt.trim() : (opt.optionText || "").trim(),
    isCorrect: Number(questionData.correctOption) === idx || Boolean(opt.isCorrect),
  }));

  if (options.length < 2) {
    throw new AppError(422, "VALIDATION_ERROR", "At least two options are required");
  }

  const newQuestion = {
    id: `q_${randomUUID()}`,
    questionText: questionData.questionText.trim(),
    options,
    explanation: questionData.explanation?.trim() || "",
    gradeLevel: questionData.gradeLevel || exam.gradeLevel,
    topicId: questionData.topicId || (exam.topicIds?.[0] || null),
    createdAt: new Date().toISOString(),
  };

  if (!exam.questions) exam.questions = [];
  exam.questions.push(newQuestion);
  exam.updatedAt = new Date().toISOString();

  saveExamsToFile(allExams);
  return newQuestion;
};

export const updateExamQuestion = async (examId, questionId, questionData) => {
  const allExams = loadExamsFromFile();
  const exam = allExams.find((e) => e.id === examId);
  if (!exam) {
    throw new AppError(404, "NOT_FOUND", "Exam not found");
  }

  const qIndex = (exam.questions || []).findIndex((q) => q.id === questionId);
  if (qIndex === -1) {
    throw new AppError(404, "NOT_FOUND", "Question not found in this exam");
  }

  const currentQ = exam.questions[qIndex];
  let updatedOptions = currentQ.options;

  if (questionData.options) {
    updatedOptions = questionData.options.map((opt, idx) => ({
      id: opt.id || `opt_${randomUUID()}`,
      optionText: typeof opt === "string" ? opt.trim() : (opt.optionText || "").trim(),
      isCorrect: Number(questionData.correctOption) === idx || Boolean(opt.isCorrect),
    }));
  }

  const updatedQ = {
    ...currentQ,
    questionText: questionData.questionText?.trim() || currentQ.questionText,
    options: updatedOptions,
    explanation: questionData.explanation !== undefined ? questionData.explanation.trim() : currentQ.explanation,
    topicId: questionData.topicId !== undefined ? questionData.topicId : currentQ.topicId,
    updatedAt: new Date().toISOString(),
  };

  exam.questions[qIndex] = updatedQ;
  exam.updatedAt = new Date().toISOString();
  saveExamsToFile(allExams);

  return updatedQ;
};

export const deleteExamQuestion = async (examId, questionId) => {
  const allExams = loadExamsFromFile();
  const exam = allExams.find((e) => e.id === examId);
  if (!exam) {
    throw new AppError(404, "NOT_FOUND", "Exam not found");
  }

  const qIndex = (exam.questions || []).findIndex((q) => q.id === questionId);
  if (qIndex === -1) {
    throw new AppError(404, "NOT_FOUND", "Question not found in this exam");
  }

  exam.questions.splice(qIndex, 1);
  exam.updatedAt = new Date().toISOString();
  saveExamsToFile(allExams);

  return { success: true, message: "Question removed from exam" };
};

export const bulkAddQuestionsToExam = async (examId, questions) => {
  const allExams = loadExamsFromFile();
  const exam = allExams.find((e) => e.id === examId);
  if (!exam) {
    throw new AppError(404, "NOT_FOUND", "Exam not found");
  }

  if (!Array.isArray(questions) || !questions.length) {
    throw new AppError(422, "VALIDATION_ERROR", "Questions array is required");
  }

  const newQuestions = questions.map((q, idx) => {
    const options = (q.options || []).map((opt, optIdx) => ({
      id: `opt_${randomUUID()}`,
      optionText: typeof opt === "string" ? opt.trim() : (opt.optionText || "").trim(),
      isCorrect: Number(q.correctOption) === optIdx || Boolean(opt.isCorrect),
    }));

    return {
      id: `q_${randomUUID()}`,
      questionText: q.questionText?.trim() || `Question ${idx + 1}`,
      options,
      explanation: q.explanation?.trim() || "",
      gradeLevel: q.gradeLevel || exam.gradeLevel,
      topicId: q.topicId || (exam.topicIds?.[0] || null),
      createdAt: new Date().toISOString(),
    };
  });

  if (!exam.questions) exam.questions = [];
  exam.questions.push(...newQuestions);
  exam.updatedAt = new Date().toISOString();
  saveExamsToFile(allExams);

  return {
    addedCount: newQuestions.length,
    totalQuestions: exam.questions.length,
  };
};

export const submitExamAttempt = async ({ examId, studentId, answers = [] }) => {
  const allExams = loadExamsFromFile();
  const exam = allExams.find((e) => e.id === examId);
  if (!exam) {
    throw new AppError(404, "NOT_FOUND", "Exam not found");
  }

  // Enforce Chapa payment / package access flexibly
  const now = new Date();
  const enrollments = await prisma.packageEnrollment.findMany({
    where: {
      studentId,
      startedAt: { lte: now },
      accessExpiresAt: { gt: now },
    },
    select: {
      id: true,
      packageType: true,
      gradeLevel: true,
      courseId: true,
      course: {
        select: {
          id: true,
          subjectId: true,
          gradeLevel: true,
          subject: { select: { id: true, name: true } },
        },
      },
    },
  });

  const hasAccess = checkStudentExamAccess(enrollments, exam);
  if (!hasAccess) {
    throw new AppError(
      403,
      "PACKAGE_ACCESS_REQUIRED",
      "An active package that includes this course is required to submit this exam"
    );
  }

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

  // Also record in QuizAttempt so student review snapshots & analytics function
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
    // Non-blocking recording
    console.error("Failed to record db attempt:", err.message);
  }

  return {
    examId,
    examTitle: exam.title,
    gradeLevel: exam.gradeLevel,
    subjectName: exam.subjectName,
    score: scorePercent,
    correctCount,
    totalQuestions,
    passed,
    passingScore: exam.passingScore || 60,
    answers: questionsReview,
    submittedAt: new Date().toISOString(),
  };
};
