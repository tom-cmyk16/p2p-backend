import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";
import { getPublicUploadPath } from "../../config/localUploads.js";

const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  type: true,
  textContent: true,
  fileUrl: true,
  fileName: true,
  status: true,
  isDeleted: true,
  sentAt: true,
  sender: {
    select: {
      id: true,
      fullName: true,
      role: true,
    },
  },
};

const getConversationForParticipant = async ({
  conversationId,
  userId,
  requireMentorshipAccess = false,
}) => {
  const conversation = await prisma.conversation.findUnique({
    where: {
      id: conversationId,
    },
    select: {
      id: true,
      studentId: true,
      tutorId: true,
      status: true,
      packageEnrollment: {
        select: {
          startedAt: true,
          mentorshipExpiresAt: true,
        },
      },
    },
  });

  if (!conversation) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "Conversation not found"
    );
  }

  const isParticipant =
    conversation.studentId === userId ||
    conversation.tutorId === userId;

  if (!isParticipant) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "You are not a participant in this conversation"
    );
  }

  if (
    requireMentorshipAccess &&
    (!conversation.packageEnrollment ||
      conversation.packageEnrollment.startedAt > new Date() ||
      conversation.packageEnrollment.mentorshipExpiresAt <= new Date())
  ) {
    throw new AppError(
      403,
      "MENTORSHIP_ACCESS_EXPIRED",
      "An active mentorship package is required to send messages"
    );
  }

  return conversation;
};

export const assertActiveConversationMentorship = ({
  conversationId,
  userId,
}) =>
  getConversationForParticipant({
    conversationId,
    userId,
    requireMentorshipAccess: true,
  });

export const getConversationMessages = async ({
  conversationId,
  userId,
  page = 1,
  limit = 50,
}) => {
  await getConversationForParticipant({
    conversationId,
    userId,
  });

  const skip = (page - 1) * limit;

  const [items, total] = await prisma.$transaction([
    prisma.message.findMany({
      where: {
        conversationId,
      },
      select: messageSelect,
      orderBy: {
        sentAt: "desc",
      },
      skip,
      take: limit,
    }),

    prisma.message.count({
      where: {
        conversationId,
      },
    }),
  ]);

  return {
    items,
    total,
    page,
  };
};

export const sendTextMessage = async ({
  conversationId,
  senderId,
  textContent,
}) => {
  await getConversationForParticipant({
    conversationId,
    userId: senderId,
    requireMentorshipAccess: true,
  });

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId,
      type: "TEXT",
      textContent: textContent.trim(),
    },
    select: messageSelect,
  });

  return message;
};

export const sendFileMessage = async ({
  conversationId,
  senderId,
  file,
}) => {
  if (!file) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "A message file is required",
      [
        {
          field: "file",
          message: "Please upload an image or PDF file",
        },
      ]
    );
  }

  await getConversationForParticipant({
    conversationId,
    userId: senderId,
    requireMentorshipAccess: true,
  });

  const type = file.mimetype.startsWith("image/")
    ? "IMAGE"
    : "DOCUMENT";

  return prisma.message.create({
    data: {
      conversationId,
      senderId,
      type,
      fileUrl: getPublicUploadPath(file.filename),
      fileName: file.originalname,
    },
    select: messageSelect,
  });
};