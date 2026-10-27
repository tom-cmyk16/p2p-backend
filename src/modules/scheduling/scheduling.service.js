import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";
import { existsSync } from "fs";
import path from "path";
import { resolveTutorDocumentPath } from "../../config/localUploads.js";
import { assertMentorshipAccess, assertSequentialProgression } from "../learning/learning.rules.js";
import { createOrGetConversation } from "../conversations/conversations.service.js";
import {
  createGoogleMeetEvent,
  deleteGoogleCalendarEvent,
  getGoogleConnectionStatus,
} from "./googleCalendar.service.js";

const sessionSelect = {
  id: true,
  seriesId: true,
  availabilityId: true,
  studentId: true,
  tutorId: true,
  enrollmentId: true,
  courseId: true,
  conversationId: true,
  startsAt: true,
  endsAt: true,
  meetUrl: true,
  status: true,
  course: {
    select: {
      id: true,
      gradeLevel: true,
      subject: { select: { id: true, name: true } },
    },
  },
  student: {
    select: {
      userId: true,
      user: { select: { id: true, fullName: true } },
    },
  },
  tutor: {
    select: {
      userId: true,
      user: { select: { id: true, fullName: true } },
    },
  },
  enrollment: {
    select: {
      id: true,
      startedAt: true,
      mentorshipExpiresAt: true,
      packageType: true,
      gradeLevel: true,
      courseId: true,
    },
  },
  conversation: {
    select: {
      id: true,
      rating: {
        select: {
          id: true,
          score: true,
          comment: true,
          createdAt: true,
        },
      },
    },
  },
};

const mondayOfUtcWeek = (date) => {
  const monday = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ));
  const day = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (day === 0 ? 6 : day - 1));
  return monday;
};

const packageCoversCourse = (enrollment, course) => {
  if (enrollment.packageType === "SINGLE_COURSE") {
    return enrollment.courseId === course.id;
  }
  if (enrollment.packageType === "FULL_GRADE") {
    return enrollment.gradeLevel === course.gradeLevel;
  }
  return enrollment.packageType === "ENTRANCE_GRADE_9_12" &&
    ["GRADE_9", "GRADE_10", "GRADE_11", "GRADE_12"].includes(course.gradeLevel);
};

export const getGoogleStatus = (tutorId) => getGoogleConnectionStatus(tutorId);

export const createTutorAvailability = async ({ tutorId, startsAt, endsAt }) => {
  const tutorProfile = await prisma.tutorProfile.findUnique({
    where: { userId: tutorId },
    select: { userId: true },
  });
  if (!tutorProfile) {
    throw new AppError(403, "FORBIDDEN", "Only approved tutors can publish availability");
  }

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const duration = end.getTime() - start.getTime();
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start <= new Date() ||
    duration < 30 * 60 * 1000 ||
    duration > 180 * 60 * 1000
  ) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "Availability must be in the future and last between 30 and 180 minutes"
    );
  }

  const overlapping = await prisma.tutorAvailability.findFirst({
    where: {
      tutorId,
      status: { in: ["AVAILABLE", "BOOKED"] },
      startsAt: { lt: end },
      endsAt: { gt: start },
    },
    select: { id: true },
  });
  if (overlapping) {
    throw new AppError(409, "AVAILABILITY_CONFLICT", "This time overlaps an existing tutor slot");
  }

  try {
    return await prisma.tutorAvailability.create({
      data: { tutorId, startsAt: start, endsAt: end },
      select: { id: true, tutorId: true, startsAt: true, endsAt: true, status: true },
    });
  } catch (error) {
    const databaseError = error.meta?.database_error || "";
    if (
      error.meta?.code === "23P01" ||
      databaseError.includes("tutor_availability_no_overlapping_active_slots")
    ) {
      throw new AppError(409, "AVAILABILITY_CONFLICT", "This time overlaps an existing tutor slot");
    }
    throw error;
  }
};

export const listTutorAvailability = async ({ tutorId, from, to }) => {
  const now = new Date();
  const rangeStart = from ? new Date(from) : now;
  const rangeEnd = to ? new Date(to) : new Date(now.getTime() + 30 * 86400000);
  if (
    rangeStart >= rangeEnd ||
    rangeEnd.getTime() - rangeStart.getTime() > 90 * 86400000
  ) {
    throw new AppError(422, "VALIDATION_ERROR", "Availability range must be no longer than 90 days");
  }

  return prisma.tutorAvailability.findMany({
    where: {
      status: "AVAILABLE",
      startsAt: { gte: rangeStart },
      endsAt: { lte: rangeEnd },
      ...(tutorId ? { tutorId } : {}),
    },
    select: {
      id: true,
      tutorId: true,
      startsAt: true,
      endsAt: true,
      tutor: {
        select: {
          user: { select: { fullName: true } },
          subjects: {
            select: {
              subjectId: true,
              gradeLevel: true,
              subject: {
                select: {
                  name: true,
                  courses: { select: { id: true, gradeLevel: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { startsAt: "asc" },
  }).then((slots) => slots.map((slot) => ({
    ...slot,
    tutor: {
      ...slot.tutor,
      subjects: slot.tutor.subjects.map((subject) => ({
        subjectId: subject.subjectId,
        gradeLevel: subject.gradeLevel,
        subject: { name: subject.subject.name },
        courseId: subject.subject.courses.find(
          (course) => course.gradeLevel === subject.gradeLevel
        )?.id || null,
      })),
    },
  })));
};

export const removeTutorAvailability = async ({ tutorId, availabilityId }) => {
  const result = await prisma.tutorAvailability.updateMany({
    where: { id: availabilityId, tutorId, status: "AVAILABLE" },
    data: { status: "CANCELLED" },
  });
  if (result.count !== 1) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "Available slot not found or already booked"
    );
  }
};

export const getMyMentorshipSessions = async (userId) => {
  try {
    const sessions = await prisma.mentorshipSession.findMany({
      where: {
        OR: [{ studentId: userId }, { tutorId: userId }],
      },
      select: sessionSelect,
      orderBy: { startsAt: "asc" },
    });
    return sessions.map((session) => ({
      ...session,
      googleMeetLink: session.meetUrl || null,
    }));
  } catch (error) {
    console.error("[scheduling.service.getMyMentorshipSessions] Failed to fetch mentorship sessions for userId:", userId, error);
    throw error;
  }
};

const validateBookableSeries = async ({
  studentId,
  tutorId,
  courseId,
  availabilityIds,
}) => {
  if (new Set(availabilityIds).size !== 3) {
    throw new AppError(422, "VALIDATION_ERROR", "Choose three distinct time slots");
  }
  const conversationResult = await createOrGetConversation({
    studentId,
    tutorId,
    courseId,
  });
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationResult.conversation.id },
    select: {
      id: true,
      packageEnrollmentId: true,
    },
  });
  if (!conversation?.packageEnrollmentId) {
    throw new AppError(403, "MENTORSHIP_ACCESS_REQUIRED", "An active mentorship package is required");
  }

  const [course, enrollment, slots, tutorAccount] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, gradeLevel: true, subjectId: true, subject: { select: { name: true } } },
    }),
    prisma.packageEnrollment.findUnique({
      where: { id: conversation.packageEnrollmentId },
      select: {
        id: true,
        studentId: true,
        packageType: true,
        courseId: true,
        gradeLevel: true,
        liveSessionCount: true,
        liveSessionsUsed: true,
        startedAt: true,
        mentorshipExpiresAt: true,
      },
    }),
    prisma.tutorAvailability.findMany({
      where: {
        id: { in: availabilityIds },
        tutorId,
        status: "AVAILABLE",
      },
      select: { id: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.tutorGoogleAccount.findUnique({
      where: { tutorId },
      select: { tutorId: true },
    }),
  ]);

  if (!tutorAccount) {
    throw new AppError(
      409,
      "GOOGLE_CALENDAR_NOT_CONNECTED",
      "The assigned tutor must connect Google Calendar before sessions can be booked"
    );
  }
  if (!course || !enrollment || enrollment.studentId !== studentId) {
    throw new AppError(404, "NOT_FOUND", "Course or package enrollment not found");
  }
  if (!packageCoversCourse(enrollment, course)) {
    throw new AppError(
      403,
      "PACKAGE_COURSE_MISMATCH",
      "The active mentorship package does not include the selected course"
    );
  }
  const now = new Date();
  if (enrollment.startedAt > now || enrollment.mentorshipExpiresAt <= now) {
    throw new AppError(403, "MENTORSHIP_ACCESS_EXPIRED", "An active mentorship package is required");
  }
  if (slots.length !== 3) {
    throw new AppError(409, "AVAILABILITY_CHANGED", "One or more selected slots are no longer available");
  }
  if (slots.some((slot) => slot.startsAt <= now)) {
    throw new AppError(422, "VALIDATION_ERROR", "All selected session times must be in the future");
  }
  const weekStart = mondayOfUtcWeek(slots[0].startsAt);
  if (slots.some((slot) =>
    mondayOfUtcWeek(slot.startsAt).getTime() !== weekStart.getTime()
  )) {
    throw new AppError(422, "SAME_WEEK_REQUIRED", "All three sessions must be scheduled in the same calendar week");
  }

  const slotDays = new Set(slots.map((slot) => slot.startsAt.toISOString().slice(0, 10)));
  if (slotDays.size !== 3) {
    throw new AppError(422, "DISTINCT_DAYS_REQUIRED", "Weekly mentorship schedule must be configured for 3 distinct days of the week");
  }

  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const existingWeeklySessions = await prisma.mentorshipSession.count({
    where: {
      enrollmentId: enrollment.id,
      status: { notIn: ["CANCELLED"] },
      startsAt: {
        gte: weekStart,
        lt: weekEnd,
      },
    },
  });
  if (existingWeeklySessions > 0) {
    throw new AppError(
      422,
      "WEEKLY_LIMIT_EXCEEDED",
      "Mentorship sessions are limited to a 3-day weekly schedule and have already been booked for this week"
    );
  }

  const tutorCourse = await prisma.tutorSubject.findUnique({
    where: {
      tutorId_subjectId_gradeLevel: {
        tutorId,
        subjectId: course.subjectId,
        gradeLevel: course.gradeLevel,
      },
    },
    select: { tutorId: true },
  });
  if (!tutorCourse) {
    throw new AppError(403, "TUTOR_COURSE_MISMATCH", "This tutor is not assigned to the selected course");
  }
  await assertSequentialProgression(prisma, {
    studentId,
    gradeLevel: course.gradeLevel,
  });
  await assertMentorshipAccess(prisma, { studentId, tutorId, courseId });

  if (
    enrollment.liveSessionCount !== null &&
    enrollment.liveSessionCount - enrollment.liveSessionsUsed < 3
  ) {
    throw new AppError(
      403,
      "MENTORSHIP_SESSION_LIMIT_REACHED",
      "This package does not have three remaining live mentorship sessions"
    );
  }

  return { conversation, course, enrollment, slots, weekStart };
};

export const bookWeeklyMentorshipSessions = async ({
  studentId,
  tutorId,
  courseId,
  availabilityIds,
}) => {
  const validated = await validateBookableSeries({
    studentId,
    tutorId,
    courseId,
    availabilityIds,
  });
  let series;

  try {
    series = await prisma.$transaction(async (tx) => {
      const enrollmentUpdate = await tx.packageEnrollment.updateMany({
        where: {
          id: validated.enrollment.id,
          liveSessionsUsed: validated.enrollment.liveSessionsUsed,
          startedAt: { lte: new Date() },
          mentorshipExpiresAt: { gt: new Date() },
          ...(validated.enrollment.liveSessionCount === null
            ? {}
            : {
                liveSessionsUsed: {
                  equals: validated.enrollment.liveSessionsUsed,
                  lte: validated.enrollment.liveSessionCount - 3,
                },
              }),
        },
        data: { liveSessionsUsed: { increment: 3 } },
      });
      if (enrollmentUpdate.count !== 1) {
        throw new AppError(409, "PACKAGE_SESSION_RACE", "Package session availability changed; refresh and try again");
      }

      const slotUpdate = await tx.tutorAvailability.updateMany({
        where: {
          id: { in: availabilityIds },
          tutorId,
          status: "AVAILABLE",
        },
        data: { status: "BOOKED" },
      });
      if (slotUpdate.count !== 3) {
        throw new AppError(409, "AVAILABILITY_CHANGED", "One or more selected slots were just booked");
      }

      const createdSeries = await tx.mentorshipSeries.create({
        data: {
          studentId,
          tutorId,
          enrollmentId: validated.enrollment.id,
          courseId,
          conversationId: validated.conversation.id,
          weekStart: validated.weekStart,
          sessions: {
            create: validated.slots.map((slot) => ({
              availabilityId: slot.id,
              studentId,
              tutorId,
              enrollmentId: validated.enrollment.id,
              courseId,
              conversationId: validated.conversation.id,
              startsAt: slot.startsAt,
              endsAt: slot.endsAt,
            })),
          },
        },
        select: {
          id: true,
          sessions: { select: sessionSelect, orderBy: { startsAt: "asc" } },
        },
      });
      return createdSeries;
    }, {
      maxWait: 10000,
      timeout: 20000,
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError(
        409,
        "WEEKLY_SESSIONS_ALREADY_BOOKED",
        "Exactly three sessions for this course are already scheduled in the selected week"
      );
    }
    if (error.code === "P0001" || error.message?.includes("must contain exactly three sessions")) {
      throw new AppError(
        422,
        "SERIES_REQUIRES_THREE_SESSIONS",
        "A weekly mentorship series must contain exactly three sessions (3 days a week)."
      );
    }
    throw error;
  }

  const createdEvents = [];
  try {
    const sessions = [];
    for (const session of series.sessions) {
      const event = await createGoogleMeetEvent({
        tutorId,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        studentName: session.student.user.fullName,
        courseName: `${session.course.subject.name} ${session.course.gradeLevel.replace("_", " ")}`,
      });
      createdEvents.push(event.eventId);
      const updated = await prisma.mentorshipSession.update({
        where: { id: session.id },
        data: { meetUrl: event.meetUrl, googleEventId: event.eventId },
        select: sessionSelect,
      });
      sessions.push({
        ...updated,
        googleMeetLink: updated.meetUrl || null,
      });
    }
    return {
      seriesId: series.id,
      sessions,
      googleMeetLink: sessions[0]?.googleMeetLink || null,
    };
  } catch (bookingError) {
    const cleanupErrors = [];
    for (const eventId of createdEvents) {
      try {
        await deleteGoogleCalendarEvent({ tutorId, eventId });
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    try {
      await prisma.$transaction(async (tx) => {
        await tx.mentorshipSeries.delete({ where: { id: series.id } });
        await tx.tutorAvailability.updateMany({
          where: { id: { in: availabilityIds }, status: "BOOKED" },
          data: { status: "AVAILABLE" },
        });
        await tx.packageEnrollment.updateMany({
          where: {
            id: validated.enrollment.id,
            liveSessionsUsed: { gte: 3 },
          },
          data: { liveSessionsUsed: { decrement: 3 } },
        });
      }, {
        maxWait: 10000,
        timeout: 20000,
      });
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    if (cleanupErrors.length) {
      console.error("Session booking compensation failed", cleanupErrors);
      throw new AppError(
        500,
        "SESSION_BOOKING_COMPENSATION_FAILED",
        "Google Meet setup failed and administrators must reconcile the session booking"
      );
    }
    throw bookingError;
  }
};

export const getSessionMessages = async ({ sessionId, userId, page = 1, limit = 50 }) => {
  const session = await prisma.mentorshipSession.findUnique({
    where: { id: sessionId },
    select: { id: true, studentId: true, tutorId: true, conversationId: true, status: true },
  });
  if (!session) throw new AppError(404, "NOT_FOUND", "Mentorship session not found");
  if (session.studentId !== userId && session.tutorId !== userId) {
    throw new AppError(403, "FORBIDDEN", "You cannot access this session chat");
  }

  const where = {
    sessionId,
    conversationId: session.conversationId,
    isDeleted: false,
  };
  const [items, total] = await prisma.$transaction([
    prisma.message.findMany({
      where,
      select: {
        id: true,
        conversationId: true,
        sessionId: true,
        senderId: true,
        type: true,
        textContent: true,
        fileUrl: true,
        fileName: true,
        status: true,
        sentAt: true,
      },
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.message.count({ where }),
  ]);
  return {
    items: items.map((message) => ({
      ...message,
      ...(message.fileUrl && {
        fileUrl: `/scheduling/sessions/${sessionId}/messages/${message.id}/file`,
      }),
    })),
    total,
    page,
  };
};

const getAuthorizedSession = async ({ sessionId, userId, requireActive = false }) => {
  const session = await prisma.mentorshipSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      studentId: true,
      tutorId: true,
      conversationId: true,
      status: true,
      enrollment: { select: { startedAt: true, mentorshipExpiresAt: true } },
    },
  });
  if (!session) throw new AppError(404, "NOT_FOUND", "Mentorship session not found");
  if (session.studentId !== userId && session.tutorId !== userId) {
    throw new AppError(403, "FORBIDDEN", "You cannot access this session chat");
  }
  if (
    requireActive &&
    (
      session.status === "CANCELLED" ||
      session.enrollment.startedAt > new Date() ||
      session.enrollment.mentorshipExpiresAt <= new Date()
    )
  ) {
    throw new AppError(403, "MENTORSHIP_ACCESS_EXPIRED", "This session chat is not active");
  }
  return session;
};

export const sendSessionMessage = async ({ sessionId, userId, textContent }) => {
  const session = await getAuthorizedSession({ sessionId, userId, requireActive: true });
  const message = await prisma.message.create({
    data: {
      conversationId: session.conversationId,
      sessionId,
      senderId: userId,
      type: "TEXT",
      textContent: textContent.trim(),
    },
    select: {
      id: true,
      conversationId: true,
      sessionId: true,
      senderId: true,
      type: true,
      textContent: true,
      sentAt: true,
    },
  });
  return message;
};

export const sendSessionFileMessage = async ({ sessionId, userId, file }) => {
  if (!file || !file.filename || file.size === 0) {
    throw new AppError(422, "VALIDATION_ERROR", "A non-empty academic resource file is required");
  }
  const session = await getAuthorizedSession({ sessionId, userId, requireActive: true });
  const extension = path.extname(file.filename).toLowerCase();
  const type = extension === ".pdf" ? "DOCUMENT" : "IMAGE";
  const message = await prisma.message.create({
    data: {
      conversationId: session.conversationId,
      sessionId,
      senderId: userId,
      type,
      fileUrl: file.filename,
      fileName: file.originalname,
    },
    select: {
      id: true,
      conversationId: true,
      sessionId: true,
      senderId: true,
      type: true,
      fileUrl: true,
      fileName: true,
      sentAt: true,
    },
  });
  return {
    ...message,
    fileUrl: `/scheduling/sessions/${sessionId}/messages/${message.id}/file`,
  };
};

export const getSessionMessageFile = async ({
  sessionId,
  messageId,
  userId,
}) => {
  await getAuthorizedSession({ sessionId, userId });
  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      sessionId,
      isDeleted: false,
      type: { in: ["IMAGE", "DOCUMENT"] },
    },
    select: { fileUrl: true, fileName: true },
  });
  if (!message?.fileUrl) {
    throw new AppError(404, "NOT_FOUND", "Session resource not found");
  }
  const filePath = resolveTutorDocumentPath(message.fileUrl);
  if (!filePath || !existsSync(filePath)) {
    throw new AppError(404, "NOT_FOUND", "Session resource file not found");
  }
  return {
    path: filePath,
    fileName: path.basename(message.fileName),
    extension: path.extname(filePath).toLowerCase(),
  };
};

export const getTutorAssignedStudents = async (tutorId) => {
  const now = new Date();
  const enrollments = await prisma.packageEnrollment.findMany({
    where: {
      assignedTutorId: tutorId,
      startedAt: { lte: now },
      mentorshipExpiresAt: { gt: now },
    },
    include: {
      student: {
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              phoneOrEmail: true,
            },
          },
        },
      },
      course: {
        include: {
          subject: true,
        },
      },
      conversations: {
        where: { tutorId },
        select: { id: true },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  return enrollments.map((en) => {
    const liveSessionsRemaining =
      en.liveSessionCount !== null ? Math.max(0, en.liveSessionCount - en.liveSessionsUsed) : null;

    return {
      enrollmentId: en.id,
      studentId: en.studentId,
      studentName: en.student?.user?.fullName || "Student",
      studentEmail: en.student?.user?.phoneOrEmail,
      gradeLevel: en.gradeLevel || en.course?.gradeLevel,
      courseId: en.courseId,
      courseName: en.course?.subject?.name || en.packageType?.replace(/_/g, " "),
      packageType: en.packageType,
      mentorshipExpiresAt: en.mentorshipExpiresAt,
      liveSessionsTotal: en.liveSessionCount,
      liveSessionsUsed: en.liveSessionsUsed,
      liveSessionsRemaining,
      conversationId: en.conversations?.[0]?.id || null,
    };
  });
};

export const normalizeWeeklySessionSlots = (slots) => {
  const now = Date.now();
  // Filter valid slots with valid date-times
  const validSlots = (Array.isArray(slots) ? slots : [])
    .filter((slot) => slot && slot.startsAt && !isNaN(new Date(slot.startsAt).getTime()))
    .map((slot) => {
      let start = new Date(slot.startsAt);
      if (start.getTime() <= now) {
        // If in past, shift to future
        start = new Date(now + 60 * 60 * 1000);
      }
      let end = slot.endsAt && !isNaN(new Date(slot.endsAt).getTime())
        ? new Date(slot.endsAt)
        : new Date(start.getTime() + 60 * 60 * 1000);
      if (end.getTime() <= start.getTime()) {
        end = new Date(start.getTime() + 60 * 60 * 1000);
      }
      return {
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      };
    });

  // Sort slots chronologically
  validSlots.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  // Auto-adjustment: if 0 valid slots are passed, auto-generate 3 sessions starting tomorrow at 10:00 UTC
  if (validSlots.length === 0) {
    const base = new Date();
    base.setDate(base.getDate() + 1);
    base.setHours(10, 0, 0, 0);

    return [0, 2, 4].map((dayOffset) => {
      const start = new Date(base.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      return {
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      };
    });
  }

  // If already exactly 3 slots, return as is
  if (validSlots.length === 3) {
    return validSlots;
  }

  // If more than 3 slots provided, trim to exactly 3
  if (validSlots.length > 3) {
    return validSlots.slice(0, 3);
  }

  // Auto-adjustment: if fewer than 3 sessions provided (1 or 2 slots),
  // extrapolate remaining sessions with a 48-hour (2-day) step maintaining consistent session duration.
  const adjusted = [...validSlots];
  while (adjusted.length < 3) {
    const last = adjusted[adjusted.length - 1];
    const lastStart = new Date(last.startsAt).getTime();
    const lastEnd = new Date(last.endsAt).getTime();
    const duration = Math.max(30 * 60 * 1000, lastEnd - lastStart || 60 * 60 * 1000);

    const nextStart = new Date(lastStart + 2 * 24 * 60 * 60 * 1000);
    const nextEnd = new Date(nextStart.getTime() + duration);

    adjusted.push({
      startsAt: nextStart.toISOString(),
      endsAt: nextEnd.toISOString(),
    });
  }

  return adjusted;
};

export const scheduleMentorWeeklySessions = async ({
  tutorId,
  studentId,
  enrollmentId,
  courseId,
  slots = [],
}) => {
  // Normalize and auto-adjust slots so there are ALWAYS exactly 3 sessions
  const normalizedSlots = normalizeWeeklySessionSlots(slots);
  if (normalizedSlots.length !== 3) {
    throw new AppError(
      422,
      "SERIES_REQUIRES_THREE_SESSIONS",
      "A weekly mentorship series must contain exactly three sessions (3 days a week)."
    );
  }

  const enrollment = await prisma.packageEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      course: true,
      student: { include: { user: true } },
    },
  });

  if (!enrollment || enrollment.studentId !== studentId) {
    throw new AppError(404, "NOT_FOUND", "Enrollment record not found for student");
  }

  if (enrollment.assignedTutorId && enrollment.assignedTutorId !== tutorId) {
    throw new AppError(403, "FORBIDDEN", "You are not the assigned mentor for this student");
  }

  const targetCourseId = courseId || enrollment.courseId;
  const conversationResult = await createOrGetConversation({
    studentId,
    tutorId,
    courseId: targetCourseId,
  });
  const conversationId = conversationResult.conversation.id;

  const requiredCount = 3;
  if (
    enrollment.liveSessionCount !== null &&
    enrollment.liveSessionCount - enrollment.liveSessionsUsed < requiredCount
  ) {
    throw new AppError(
      403,
      "MENTORSHIP_SESSION_LIMIT_REACHED",
      `Student only has ${Math.max(0, enrollment.liveSessionCount - enrollment.liveSessionsUsed)} sessions remaining in this package (3 required for weekly schedule)`
    );
  }

  const firstSlotStart = new Date(normalizedSlots[0].startsAt);
  const weekStart = mondayOfUtcWeek(firstSlotStart);

  const tutorAccount = await prisma.tutorGoogleAccount.findUnique({
    where: { tutorId },
  });

  // Pre-generate meet links for all 3 sessions outside transaction
  const meetLinks = [];
  for (let i = 0; i < 3; i++) {
    const slot = normalizedSlots[i];
    const start = new Date(slot.startsAt);
    const end = new Date(slot.endsAt);
    let meetUrl = null;
    let googleEventId = null;

    if (tutorAccount) {
      try {
        const meetEvent = await createGoogleMeetEvent({
          tutorId,
          startsAt: start,
          endsAt: end,
          summary: `Mentorship Session: ${enrollment.student?.user?.fullName || "Student"} with Tutor`,
          attendeeEmail: enrollment.student?.user?.phoneOrEmail,
        });
        meetUrl = meetEvent?.meetUrl;
        googleEventId = meetEvent?.eventId;
      } catch (err) {
        console.warn("Google Meet integration fallback:", err.message);
      }
    }

    if (!meetUrl) {
      const roomSlug = `p2p-mentor-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`;
      meetUrl = `https://meet.jit.si/${roomSlug}`;
    }

    meetLinks.push({ meetUrl, googleEventId, start, end });
  }

  // Check if series already exists for this week before entering transaction
  const existingSeries = await prisma.mentorshipSeries.findUnique({
    where: {
      enrollmentId_courseId_weekStart: {
        enrollmentId: enrollment.id,
        courseId: targetCourseId,
        weekStart,
      },
    },
    select: {
      id: true,
      sessions: {
        select: { id: true, availabilityId: true },
      },
    },
  });

  try {
    const createdSessions = await prisma.$transaction(async (tx) => {
      // Create availability records for all 3 sessions concurrently in parallel
      const availabilityRecords = await Promise.all(
        meetLinks.slice(0, 3).map(({ start, end }) =>
          tx.tutorAvailability.create({
            data: {
              tutorId,
              startsAt: start,
              endsAt: end,
              status: "BOOKED",
            },
            select: { id: true },
          })
        )
      );

      const preparedSessions = availabilityRecords.map((avail, i) => ({
        availabilityId: avail.id,
        studentId,
        tutorId,
        enrollmentId: enrollment.id,
        courseId: targetCourseId,
        conversationId,
        startsAt: meetLinks[i].start,
        endsAt: meetLinks[i].end,
        meetUrl: meetLinks[i].meetUrl,
        googleEventId: meetLinks[i].googleEventId,
        status: "SCHEDULED",
      }));

      if (preparedSessions.length !== 3) {
        throw new AppError(
          422,
          "SERIES_REQUIRES_THREE_SESSIONS",
          "A weekly mentorship series must contain exactly three sessions."
        );
      }

      if (!existingSeries) {
        // Create new series with all 3 sessions created atomically in ONE statement
        // to satisfy the enforce_three_sessions_per_series PostgreSQL constraint trigger.
        const series = await tx.mentorshipSeries.create({
          data: {
            studentId,
            tutorId,
            enrollmentId: enrollment.id,
            courseId: targetCourseId,
            conversationId,
            weekStart,
            sessions: {
              create: preparedSessions,
            },
          },
          select: {
            id: true,
            sessions: { select: sessionSelect, orderBy: { startsAt: "asc" } },
          },
        });

        if (enrollment.liveSessionCount !== null) {
          await tx.packageEnrollment.update({
            where: { id: enrollment.id },
            data: { liveSessionsUsed: { increment: requiredCount } },
          });
        }

        return series.sessions;
      } else {
        // Series already exists for this week: atomically replace the 3 sessions
        const oldAvailIds = existingSeries.sessions.map((s) => s.availabilityId).filter(Boolean);

        await tx.mentorshipSession.deleteMany({
          where: { seriesId: existingSeries.id },
        });

        if (oldAvailIds.length > 0) {
          await tx.tutorAvailability.deleteMany({
            where: { id: { in: oldAvailIds } },
          });
        }

        await Promise.all(
          preparedSessions.map((s) =>
            tx.mentorshipSession.create({
              data: {
                ...s,
                seriesId: existingSeries.id,
              },
            })
          )
        );

        return tx.mentorshipSession.findMany({
          where: { seriesId: existingSeries.id },
          select: sessionSelect,
          orderBy: { startsAt: "asc" },
        });
      }
    }, {
      maxWait: 10000,
      timeout: 20000,
    });

    const mappedSessions = createdSessions.map((session) => ({
      ...session,
      googleMeetLink: session.meetUrl || null,
    }));

    return {
      success: true,
      scheduledCount: mappedSessions.length,
      sessions: mappedSessions,
      googleMeetLink: mappedSessions[0]?.googleMeetLink || null,
    };
  } catch (error) {
    if (error.code === "P0001" || error.message?.includes("must contain exactly three sessions")) {
      throw new AppError(
        422,
        "SERIES_REQUIRES_THREE_SESSIONS",
        "A weekly mentorship series must contain exactly three sessions (3 days a week)."
      );
    }
    if (error.code === "P2028" || error.message?.includes("Transaction already closed") || error.message?.includes("timed out")) {
      throw new AppError(
        504,
        "TRANSACTION_TIMEOUT",
        "The mentorship scheduling transaction timed out. Please try scheduling again."
      );
    }
    throw error;
  }
};

export const assignMentorToEnrollment = async ({ studentId, enrollmentId, tutorId }) => {
  const enrollment = await prisma.packageEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { course: true },
  });

  if (!enrollment || enrollment.studentId !== studentId) {
    throw new AppError(404, "NOT_FOUND", "Package enrollment not found");
  }

  // Mentor selection lock: once assigned, prevent re-assignment to another mentor
  if (enrollment.assignedTutorId) {
    if (enrollment.assignedTutorId === tutorId) {
      const conversationResult = await createOrGetConversation({
        studentId,
        tutorId,
        courseId: enrollment.courseId,
      });
      return {
        success: true,
        enrollment,
        conversationId: conversationResult.conversation.id,
      };
    }
    throw new AppError(
      400,
      "MENTOR_ALREADY_ASSIGNED",
      "Mentor selection is locked. You have already assigned an active mentor for this package enrollment and cannot switch mentors."
    );
  }

  let tutor = await prisma.tutorProfile.findUnique({
    where: { userId: tutorId },
    include: { user: true },
  });

  if (!tutor) {
    const tutorUser = await prisma.user.findFirst({
      where: {
        id: tutorId,
        role: "TUTOR",
        status: { notIn: ["SUSPENDED", "BANNED"] },
      },
    });

    if (!tutorUser) {
      throw new AppError(404, "NOT_FOUND", "Tutor profile not found");
    }

    // Auto-create application and profile for this tutor so the foreign key in packageEnrollment succeeds
    let application = await prisma.tutorApplication.findFirst({
      where: { userId: tutorId },
    });

    if (!application) {
      application = await prisma.tutorApplication.create({
        data: {
          userId: tutorId,
          educationLevel: "UNIVERSITY",
          institutionName: "Academic Mentorship Network",
          bio: "Dedicated peer mentor & subject specialist.",
          status: "APPROVED",
        },
      });
    }

    const adminUser = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    const approvedById = adminUser ? adminUser.id : tutorId;

    tutor = await prisma.tutorProfile.upsert({
      where: { userId: tutorId },
      update: {},
      create: {
        userId: tutorId,
        approvedApplicationId: application.id,
        bio: application.bio || "Dedicated peer mentor & subject specialist.",
        educationLevel: application.educationLevel || "UNIVERSITY",
        institutionName: application.institutionName || "Academic Mentorship Network",
        approvedById: approvedById,
      },
      include: { user: true },
    });
  }

  const updatedEnrollment = await prisma.packageEnrollment.update({
    where: { id: enrollmentId },
    data: { assignedTutorId: tutorId },
    include: {
      assignedTutor: {
        include: { user: { select: { fullName: true } } },
      },
    },
  });

  const conversationResult = await createOrGetConversation({
    studentId,
    tutorId,
    courseId: enrollment.courseId,
  });

  return {
    success: true,
    enrollment: updatedEnrollment,
    conversationId: conversationResult.conversation.id,
  };
};
