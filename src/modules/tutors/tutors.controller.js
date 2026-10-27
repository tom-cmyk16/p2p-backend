import {
  getAllSubjects,
  getTopicsBySubject,
  getTutors,
  getTutorById,
  getMyTutorProfile,
  updateMyTutorProfile,
} from "./tutors.service.js";

import {
  tutorListQuerySchema,
  subjectIdParamSchema,
  tutorIdParamSchema,
} from "./tutors.validation.js";

import { AppError } from "../../utils/ApiError.js";

export const listSubjects = async (req, res, next) => {
  try {
    const subjects = await getAllSubjects();

    return res.status(200).json(subjects);
  } catch (error) {
    next(error);
  }
};

export const listTopicsBySubject = async (req, res, next) => {
  try {
    const result = subjectIdParamSchema.safeParse(req.params);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      return next(
        new AppError(
          422,
          "VALIDATION_ERROR",
          "Request validation failed",
          details
        )
      );
    }

    const topics = await getTopicsBySubject(
      result.data.subjectId
    );

    return res.status(200).json(topics);
  } catch (error) {
    next(error);
  }
};

export const listTutors = async (req, res, next) => {
  try {
    const result = tutorListQuerySchema.safeParse(req.query);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      return next(
        new AppError(
          422,
          "VALIDATION_ERROR",
          "Request validation failed",
          details
        )
      );
    }

    const tutors = await getTutors(result.data);

    return res.status(200).json(tutors);
  } catch (error) {
    next(error);
  }
};

export const getTutor = async (req, res, next) => {
  try {
    const result = tutorIdParamSchema.safeParse(req.params);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      return next(
        new AppError(
          422,
          "VALIDATION_ERROR",
          "Request validation failed",
          details
        )
      );
    }

    const tutor = await getTutorById(
      result.data.tutorId
    );

    return res.status(200).json(tutor);
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const tutor = await getMyTutorProfile(req.user.id);
    return res.status(200).json(tutor);
  } catch (error) {
    next(error);
  }
};

export const updateMe = async (req, res, next) => {
  try {
    const tutor = await updateMyTutorProfile(req.user.id, req.body);
    return res.status(200).json(tutor);
  } catch (error) {
    next(error);
  }
};