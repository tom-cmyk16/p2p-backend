import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";
import { assertMentorshipAccess } from "../learning/learning.rules.js";

const conversationSelect = {
  id: true,
  studentId: true,
  tutorId: true,
  status: true,
  createdAt: true,
  packageEnrollmentId: true,
  student: {
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          fullName: true,
          phoneOrEmail: true,
        },
      },
    },
  },
  tutor: {
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          fullName: true,
          phoneOrEmail: true,
        },
      },
    },
  },
  packageEnrollment: {
    select: {
      id: true,
      packageType: true,
      startedAt: true,
      mentorshipExpiresAt: true,
      course: {
        select: {
          id: true,
          gradeLevel: true,
          subject: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
};

const attachMentorshipPackage = async (
  tx,
  conversation,
  { studentId, tutorId, courseId }
) => {
  const now = new Date();
  const enrollment = await assertMentorshipAccess(tx, {
    studentId,
    tutorId,
    courseId,
    now,
  });
  if (
    conversation.packageEnrollmentId === enrollment.id &&
    conversation.packageEnrollment &&
    conversation.packageEnrollment.startedAt <= now &&
    conversation.packageEnrollment.mentorshipExpiresAt > now
  ) {
    return conversation;
  }

  return tx.conversation.update({
    where: { id: conversation.id },
    data: { packageEnrollmentId: enrollment.id },
    select: conversationSelect,
  });
};

export const getMyConversations = async (userId) => {
  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [
        { studentId: userId },
        { tutorId: userId },
      ],
    },
    select: conversationSelect,
    orderBy: {
      createdAt: "desc",
    },
  });

  return conversations;
};

export const createOrGetConversation = async ({
  studentId,
  tutorId,
  courseId,
}) => {
  // Make sure the logged-in user actually has a student profile.
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

  // A conversation can only be created with an approved tutor.
  const tutorProfile = await prisma.tutorProfile.findUnique({
    where: { userId: tutorId },
    select: { userId: true },
  });

  if (!tutorProfile) {
    throw new AppError(404, "NOT_FOUND", "Tutor not found");
  }

  // First check whether this student already has
  // a conversation with this tutor.
  const existingConversation = await prisma.conversation.findUnique({
    where: {
      studentId_tutorId: {
        studentId,
        tutorId,
      },
    },
    select: conversationSelect,
  });

  if (existingConversation) {
    const conversation = await prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findUnique({
        where: { id: existingConversation.id },
        select: conversationSelect,
      });
      if (!existing) {
        throw new AppError(404, "NOT_FOUND", "Conversation not found");
      }
      return attachMentorshipPackage(tx, existing, { studentId, tutorId, courseId });
    });
    return {
      conversation,
      created: false,
    };
  }

  try {
    const conversation = await prisma.$transaction(async (tx) => {
      const concurrentConversation = await tx.conversation.findUnique({
        where: {
          studentId_tutorId: {
            studentId,
            tutorId,
          },
        },
        select: conversationSelect,
      });
      if (concurrentConversation) {
        return {
          conversation: await attachMentorshipPackage(
            tx,
            concurrentConversation,
            { studentId, tutorId, courseId }
          ),
          created: false,
        };
      }

      const enrollment = await assertMentorshipAccess(tx, {
        studentId,
        tutorId,
        courseId,
      });

      return {
        conversation: await tx.conversation.create({
          data: {
            studentId,
            tutorId,
            packageEnrollmentId: enrollment.id,
          },
          select: conversationSelect,
        }),
        created: true,
      };
    });

    return {
      ...conversation,
    };
  } catch (error) {
    // Protect the idempotent behavior if two requests
    // try to create the same conversation at the same time.
    if (error.code === "P2002") {
      const conversation = await prisma.conversation.findUnique({
        where: {
          studentId_tutorId: {
            studentId,
            tutorId,
          },
        },
        select: conversationSelect,
      });

      if (conversation) {
        return {
          conversation,
          created: false,
        };
      }
    }

    throw error;
  }
};