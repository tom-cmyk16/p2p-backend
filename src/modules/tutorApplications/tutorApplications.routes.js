import express from "express";

import {
  createApplication,
  getDocument,
  getMyApplication,
  uploadDocument,
} from "./tutorApplications.controller.js";

import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/requireRole.middleware.js";
import { uploadPrivateTutorApplicationDocument } from "../../middlewares/upload.middleware.js";
const router = express.Router();

router.get(
  "/me",
  authenticate,
  requireRole("TUTOR"),
  getMyApplication
);

router.post(
  "/",
  authenticate,
  requireRole("TUTOR"),
  uploadPrivateTutorApplicationDocument,
  createApplication
);

router.get(
  "/:id/documents/:documentId",
  authenticate,
  requireRole("TUTOR"),
  getDocument
);

router.post(
  "/:id/documents",
  authenticate,
  requireRole("TUTOR"),
  uploadPrivateTutorApplicationDocument,
  uploadDocument
);

export default router;