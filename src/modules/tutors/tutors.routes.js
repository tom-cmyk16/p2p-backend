import { Router } from "express";

import { authenticate, optionalAuthenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/requireRole.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import {
  getMe,
  listSubjects,
  listTopicsBySubject,
  listTutors,
  getTutor,
  updateMe,
} from "./tutors.controller.js";
import { updateTutorProfileSchema } from "./tutors.validation.js";

const router = Router();

/*
 * Subjects
 */

router.get("/subjects", authenticate,
  listSubjects
);

router.get("/subjects/:subjectId/topics", authenticate,
  listTopicsBySubject
);

router.get(
  "/tutors/me",
  authenticate,
  requireRole("TUTOR"),
  getMe
);

/*
 * Tutors
 */

router.get(
  "/tutors",
  optionalAuthenticate,
  listTutors
);

router.get(
  "/mentors",
  optionalAuthenticate,
  listTutors
);

router.patch(
  "/tutors/me",
  authenticate,
  requireRole("TUTOR"),
  validate(updateTutorProfileSchema),
  updateMe
);

router.get(
  "/tutors/:tutorId",
  authenticate,
  getTutor
);

export default router;