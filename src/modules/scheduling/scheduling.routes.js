import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/requireRole.middleware.js";
import {
  validate,
  validateParams,
  validateQuery,
} from "../../middlewares/validate.middleware.js";
import { uploadPrivateTutorApplicationDocument } from "../../middlewares/upload.middleware.js";
import {
  availabilityIdParamsSchema,
  availabilityQuerySchema,
  bookWeeklySessionsSchema,
  createAvailabilitySchema,
  sessionMessagesQuerySchema,
  sessionIdParamsSchema,
  sessionMessageSchema,
} from "./scheduling.validation.js";
import {
  bookSessions,
  connectGoogleCalendar,
  createAvailability,
  createSessionFileMessage,
  createSessionMessage,
  deleteAvailability,
  getSessionResource,
  googleCalendarCallback,
  googleStatus,
  listAvailability,
  listSessionMessages,
  listSessions,
  listAssignedStudents,
  mentorScheduleSessions,
  studentAssignMentor,
} from "./scheduling.controller.js";

const router = Router();

router.get("/assigned-students", authenticate, requireRole("TUTOR"), listAssignedStudents);
router.post("/sessions/mentor-schedule", authenticate, requireRole("TUTOR"), mentorScheduleSessions);
router.post("/assign-mentor", authenticate, requireRole("STUDENT"), studentAssignMentor);

router.get("/google/callback", googleCalendarCallback);
router.get("/google/status", authenticate, requireRole("TUTOR"), googleStatus);
router.post("/google/connect", authenticate, requireRole("TUTOR"), connectGoogleCalendar);

router.get(
  "/availability",
  authenticate,
  validateQuery(availabilityQuerySchema),
  listAvailability
);
router.post(
  "/availability",
  authenticate,
  requireRole("TUTOR"),
  validate(createAvailabilitySchema),
  createAvailability
);
router.delete(
  "/availability/:availabilityId",
  authenticate,
  requireRole("TUTOR"),
  validateParams(availabilityIdParamsSchema),
  deleteAvailability
);

router.get("/sessions", authenticate, listSessions);
router.post(
  "/sessions/book",
  authenticate,
  requireRole("STUDENT"),
  validate(bookWeeklySessionsSchema),
  bookSessions
);

router.get(
  "/sessions/:sessionId/messages",
  authenticate,
  validateParams(sessionIdParamsSchema),
  validateQuery(sessionMessagesQuerySchema),
  listSessionMessages
);
router.post(
  "/sessions/:sessionId/messages",
  authenticate,
  validateParams(sessionIdParamsSchema),
  validate(sessionMessageSchema),
  createSessionMessage
);
router.post(
  "/sessions/:sessionId/messages/file",
  authenticate,
  validateParams(sessionIdParamsSchema),
  uploadPrivateTutorApplicationDocument,
  createSessionFileMessage
);
router.get(
  "/sessions/:sessionId/messages/:messageId/file",
  authenticate,
  validateParams(sessionIdParamsSchema.extend({
    messageId: sessionIdParamsSchema.shape.sessionId,
  })),
  getSessionResource
);

export default router;
