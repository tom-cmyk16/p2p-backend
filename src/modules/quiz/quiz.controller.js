import {
  createQuestion as createQuestionRecord,
  bulkCreateQuestions as bulkCreateQuestionsRecord,
  createSubject as createSubjectRecord,
  createTopic as createTopicRecord,
  deleteSubject as deleteSubjectRecord,
  deleteTopic as deleteTopicRecord,
  getQuizAttemptHistory,
  getQuizQuestions,
  listManagedQuestions as listManagedQuestionRecords,
  listManagedQuizAttempts,
  getWeakTopics,
  setQuestionPublished,
  submitQuizAttempt,
  updateQuestion as updateQuestionRecord,
  updateSubject as updateSubjectRecord,
  updateTopic as updateTopicRecord,
} from "./quiz.service.js";
import * as examsService from "./exams.service.js";

export const createSubject = async (req, res, next) => {
  try {
    const subject = await createSubjectRecord(req.body);
    return res.status(201).json(subject);
  } catch (error) {
    next(error);
  }
};

export const updateSubject = async (req, res, next) => {
  try {
    return res.status(200).json(await updateSubjectRecord({
      subjectId: req.params.subjectId,
      ...req.body,
    }));
  } catch (error) {
    next(error);
  }
};

export const deleteSubject = async (req, res, next) => {
  try {
    await deleteSubjectRecord(req.params.subjectId);
    return res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const createTopic = async (req, res, next) => {
  try {
    const topic = await createTopicRecord(req.body);
    return res.status(201).json(topic);
  } catch (error) {
    next(error);
  }
};

export const updateTopic = async (req, res, next) => {
  try {
    return res.status(200).json(await updateTopicRecord({
      topicId: req.params.topicId,
      ...req.body,
    }));
  } catch (error) {
    next(error);
  }
};

export const deleteTopic = async (req, res, next) => {
  try {
    await deleteTopicRecord(req.params.topicId);
    return res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const createQuestion = async (req, res, next) => {
  try {
    const question = await createQuestionRecord({
      ...req.body,
      createdById: req.user.id,
    });
    return res.status(201).json(question);
  } catch (error) {
    next(error);
  }
};

export const bulkCreateQuestions = async (req, res, next) => {
  try {
    const result = await bulkCreateQuestionsRecord({
      ...req.body,
      createdById: req.user.id,
    });
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const listManagedQuestions = async (req, res, next) => {
  try {
    const questions = await listManagedQuestionRecords({
      ...req.query,
      userId: req.user.id,
      role: req.user.role,
    });
    return res.status(200).json(questions);
  } catch (error) {
    next(error);
  }
};

export const updateQuestion = async (req, res, next) => {
  try {
    const question = await updateQuestionRecord({
      ...req.body,
      questionId: req.params.questionId,
      userId: req.user.id,
      role: req.user.role,
    });
    return res.status(200).json(question);
  } catch (error) {
    next(error);
  }
};

export const moderateQuestion = async (req, res, next) => {
  try {
    const question = await setQuestionPublished({
      questionId: req.params.questionId,
      userId: req.user.id,
      role: req.user.role,
      isPublished: req.body.isPublished,
    });
    return res.status(200).json(question);
  } catch (error) {
    next(error);
  }
};

export const archiveQuestion = async (req, res, next) => {
  try {
    const question = await setQuestionPublished({
      questionId: req.params.questionId,
      userId: req.user.id,
      role: req.user.role,
      isPublished: false,
    });
    return res.status(200).json(question);
  } catch (error) {
    next(error);
  }
};

export const listManagedAttempts = async (req, res, next) => {
  try {
    const attempts = await listManagedQuizAttempts({
      userId: req.user.id,
      role: req.user.role,
    });
    return res.status(200).json(attempts);
  } catch (error) {
    next(error);
  }
};

export const listQuizQuestions = async (req, res, next) => {
  try {
    const questions = await getQuizQuestions({
      ...req.query,
      studentId: req.user.id,
    });

    return res.status(200).json(questions);
  } catch (error) {
    next(error);
  }
};

export const listQuizAttemptHistory = async (req, res, next) => {
  try {
    return res.status(200).json(await getQuizAttemptHistory(req.user.id));
  } catch (error) {
    next(error);
  }
};

export const createQuizAttempt = async (req, res, next) => {
  try {
    const result = await submitQuizAttempt({
      studentId: req.user.id,
      subjectId: req.body.subjectId,
      gradeLevel: req.body.gradeLevel,
      answers: req.body.answers,
    });

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const listWeakTopics = async (req, res, next) => {
  try {
    const weakTopics = await getWeakTopics(req.user.id);

    return res.status(200).json(weakTopics);
  } catch (error) {
    next(error);
  }
};

// Exam Controllers
export const listAllExams = async (req, res, next) => {
  try {
    const isStudent = req.user?.role === "STUDENT";
    const exams = await examsService.listExams({
      ...req.query,
      studentId: isStudent ? req.user.id : undefined,
    });
    return res.status(200).json(exams);
  } catch (error) {
    next(error);
  }
};

export const getSingleExam = async (req, res, next) => {
  try {
    const isStudent = req.user?.role === "STUDENT";
    const exam = await examsService.getExamById(req.params.examId, {
      studentId: isStudent ? req.user.id : undefined,
    });
    return res.status(200).json(exam);
  } catch (error) {
    next(error);
  }
};

export const createExamHandler = async (req, res, next) => {
  try {
    const exam = await examsService.createExam({
      ...req.body,
      createdById: req.user.id,
    });
    return res.status(201).json(exam);
  } catch (error) {
    next(error);
  }
};

export const updateExamHandler = async (req, res, next) => {
  try {
    const exam = await examsService.updateExam(req.params.examId, req.body);
    return res.status(200).json(exam);
  } catch (error) {
    next(error);
  }
};

export const deleteExamHandler = async (req, res, next) => {
  try {
    const result = await examsService.deleteExam(req.params.examId);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const addQuestionToExamHandler = async (req, res, next) => {
  try {
    const question = await examsService.addQuestionToExam(req.params.examId, req.body);
    return res.status(201).json(question);
  } catch (error) {
    next(error);
  }
};

export const updateExamQuestionHandler = async (req, res, next) => {
  try {
    const question = await examsService.updateExamQuestion(
      req.params.examId,
      req.params.questionId,
      req.body
    );
    return res.status(200).json(question);
  } catch (error) {
    next(error);
  }
};

export const deleteExamQuestionHandler = async (req, res, next) => {
  try {
    const result = await examsService.deleteExamQuestion(
      req.params.examId,
      req.params.questionId
    );
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const bulkAddExamQuestionsHandler = async (req, res, next) => {
  try {
    const result = await examsService.bulkAddQuestionsToExam(
      req.params.examId,
      req.body.questions
    );
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const submitExamAttemptHandler = async (req, res, next) => {
  try {
    const result = await examsService.submitExamAttempt({
      examId: req.params.examId,
      studentId: req.user.id,
      answers: req.body.answers,
    });
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};