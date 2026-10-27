import { removeUploadedFile } from "../../config/localUploads.js";
import { AppError } from "../../utils/ApiError.js";
import {
  completeGoogleAuthorization,
  getGoogleAuthorizationUrl,
} from "./googleCalendar.service.js";
import {
  bookWeeklyMentorshipSessions,
  createTutorAvailability,
  getGoogleStatus,
  getMyMentorshipSessions,
  getSessionMessageFile,
  getSessionMessages,
  listTutorAvailability,
  removeTutorAvailability,
  sendSessionFileMessage,
  sendSessionMessage,
  getTutorAssignedStudents,
  scheduleMentorWeeklySessions,
  assignMentorToEnrollment,
} from "./scheduling.service.js";

export const listAvailability = async (req, res, next) => {
  try {
    const availability = await listTutorAvailability(req.query);
    return res.status(200).json(availability);
  } catch (error) {
    next(error);
  }
};

export const createAvailability = async (req, res, next) => {
  try {
    const slot = await createTutorAvailability({
      tutorId: req.user.id,
      ...req.body,
    });
    return res.status(201).json(slot);
  } catch (error) {
    next(error);
  }
};

export const deleteAvailability = async (req, res, next) => {
  try {
    await removeTutorAvailability({
      tutorId: req.user.id,
      availabilityId: req.params.availabilityId,
    });
    return res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const listSessions = async (req, res, next) => {
  try {
    const sessions = await getMyMentorshipSessions(req.user.id);
    return res.status(200).json(sessions);
  } catch (error) {
    console.error("[scheduling.controller.listSessions] Error fetching mentorship sessions for user:", req.user?.id, error);
    next(error);
  }
};

export const bookSessions = async (req, res, next) => {
  try {
    const result = await bookWeeklyMentorshipSessions({
      studentId: req.user.id,
      ...req.body,
    });
    const io = req.app.get("io");
    if (io) {
      result.sessions.forEach((session) => {
        io.to(`session:${session.id}`).emit("session:updated", session);
      });
    }
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const listAssignedStudents = async (req, res, next) => {
  try {
    const students = await getTutorAssignedStudents(req.user.id);
    return res.status(200).json(students);
  } catch (error) {
    next(error);
  }
};

export const mentorScheduleSessions = async (req, res, next) => {
  try {
    const result = await scheduleMentorWeeklySessions({
      tutorId: req.user.id,
      ...req.body,
    });
    const io = req.app.get("io");
    if (io && result.sessions) {
      result.sessions.forEach((session) => {
        io.to(`session:${session.id}`).emit("session:updated", session);
      });
    }
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const studentAssignMentor = async (req, res, next) => {
  try {
    const result = await assignMentorToEnrollment({
      studentId: req.user.id,
      enrollmentId: req.body.enrollmentId,
      tutorId: req.body.tutorId,
    });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const googleStatus = async (req, res, next) => {
  try {
    return res.status(200).json(await getGoogleStatus(req.user.id));
  } catch (error) {
    next(error);
  }
};

export const connectGoogleCalendar = async (req, res, next) => {
  try {
    return res.status(200).json({
      authorizationUrl: await getGoogleAuthorizationUrl(req.user.id),
    });
  } catch (error) {
    next(error);
  }
};

export const googleCalendarCallback = async (req, res, next) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      const frontend = (process.env.FRONTEND_URL || "http://localhost:5173")
        .split(",")[0]
        .trim();
      return res.redirect(`${frontend}/tutor-portal/schedule?calendar=denied`);
    }
    if (typeof code !== "string" || typeof state !== "string") {
      throw new AppError(400, "INVALID_OAUTH_CALLBACK", "Google authorization callback is incomplete");
    }
    await completeGoogleAuthorization({ code, state });
    const frontend = (process.env.FRONTEND_URL || "http://localhost:5173")
      .split(",")[0]
      .trim();
    return res.redirect(`${frontend}/tutor-portal/schedule?calendar=connected`);
  } catch (callbackError) {
    next(callbackError);
  }
};

export const listSessionMessages = async (req, res, next) => {
  try {
    const result = await getSessionMessages({
      sessionId: req.params.sessionId,
      userId: req.user.id,
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 50),
    });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const createSessionMessage = async (req, res, next) => {
  try {
    const message = await sendSessionMessage({
      sessionId: req.params.sessionId,
      userId: req.user.id,
      textContent: req.body.textContent,
    });
    const io = req.app.get("io");
    if (io) io.to(`session:${req.params.sessionId}`).emit("session-message:new", message);
    return res.status(201).json(message);
  } catch (error) {
    next(error);
  }
};

export const createSessionFileMessage = async (req, res, next) => {
  try {
    const message = await sendSessionFileMessage({
      sessionId: req.params.sessionId,
      userId: req.user.id,
      file: req.file,
    });
    const io = req.app.get("io");
    if (io) io.to(`session:${req.params.sessionId}`).emit("session-message:new", message);
    return res.status(201).json(message);
  } catch (error) {
    if (req.file) {
      try {
        await removeUploadedFile(req.file);
      } catch (cleanupError) {
        return next(cleanupError);
      }
    }
    next(error);
  }
};

export const getSessionResource = async (req, res, next) => {
  try {
    const resource = await getSessionMessageFile({
      sessionId: req.params.sessionId,
      messageId: req.params.messageId,
      userId: req.user.id,
    });
    const contentType = {
      ".pdf": "application/pdf",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
    }[resource.extension];
    if (!contentType) {
      throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "This resource format cannot be viewed");
    }
    return res
      .type(contentType)
      .set("Content-Disposition", `inline; filename="${resource.fileName.replace(/[^\w.\- ]/g, "_")}"`)
      .set("X-Content-Type-Options", "nosniff")
      .set("Cache-Control", "private, no-store")
      .sendFile(resource.path, (error) => {
        if (error) next(error);
      });
  } catch (error) {
    next(error);
  }
};
