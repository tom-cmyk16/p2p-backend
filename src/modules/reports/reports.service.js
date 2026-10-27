import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";

const reportSelect = {
  id: true,
  reporterId: true,
  targetType: true,
  reportedMessageId: true,
  reportedConversationId: true,
  reportedUserId: true,
  reason: true,
  status: true,
  reviewedById: true,
  createdAt: true,
  resolvedAt: true,
};

export const createReport = async ({
  reporterId,
  targetType,
  targetId,
  reason,
}) => {
  /*
   * Verify that the target exists and map the public
   * targetId into the correct Report foreign-key field.
   */
  let reportedMessageId = null;
  let reportedConversationId = null;
  let reportedUserId = null;

  if (targetType === "MESSAGE") {
    const message = await prisma.message.findUnique({
      where: {
        id: targetId,
      },
      select: {
        id: true,
      },
    });

    if (!message) {
      throw new AppError(
        404,
        "NOT_FOUND",
        "Message not found"
      );
    }

    reportedMessageId = message.id;
  }

  if (targetType === "CONVERSATION") {
    const conversation = await prisma.conversation.findUnique({
      where: {
        id: targetId,
      },
      select: {
        id: true,
      },
    });

    if (!conversation) {
      throw new AppError(
        404,
        "NOT_FOUND",
        "Conversation not found"
      );
    }

    reportedConversationId = conversation.id;
  }

  if (targetType === "USER_PROFILE") {
    const user = await prisma.user.findUnique({
      where: {
        id: targetId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new AppError(
        404,
        "NOT_FOUND",
        "User not found"
      );
    }

    reportedUserId = user.id;
  }

  const report = await prisma.report.create({
    data: {
      reporterId,
      targetType,
      reportedMessageId,
      reportedConversationId,
      reportedUserId,
      reason: reason.trim(),
    },
    select: reportSelect,
  });

  return report;
};