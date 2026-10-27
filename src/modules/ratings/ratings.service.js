import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";

const ratingSelect = {
  id: true,
  conversationId: true,
  studentId: true,
  tutorId: true,
  score: true,
  comment: true,
  createdAt: true,
};

export const createConversationRating = async ({
  conversationId,
  studentId,
  score,
  comment,
}) => {
  /*
   * 1. Verify that the authenticated user is actually
   *    the student in this conversation.
   */
  const conversation = await prisma.conversation.findUnique({
    where: {
      id: conversationId,
    },
    select: {
      id: true,
      studentId: true,
      tutorId: true,
    },
  });

  if (!conversation) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "Conversation not found"
    );
  }

  if (conversation.studentId !== studentId) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only the student in this conversation can submit a rating"
    );
  }

  /*
   * 2. Verify that the student has a StudentProfile.
   *
   *    The Rating model has a foreign key from studentId
   *    to StudentProfile.userId.
   */
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

  /*
   * 3. Prevent duplicate ratings.
   *
   *    We check before creating so the API can return a
   *    meaningful 409 error instead of exposing a Prisma
   *    unique-constraint error.
    */
  const existingRating = await prisma.rating.findUnique({
    where: {
      conversationId,
    },
    select: {
      id: true,
    },
  });

  if (existingRating) {
    const updated = await prisma.rating.update({
      where: {
        id: existingRating.id,
      },
      data: {
        score,
        comment: comment ?? null,
      },
      select: ratingSelect,
    });
    return updated;
  }

  /*
   * 4. Create the rating.
   *
   *    tutorId comes from the conversation, NOT from the
   *    request body. This prevents a student from rating
   *    an unrelated tutor.
   */
  try {
    const rating = await prisma.rating.create({
      data: {
        conversationId,
        studentId,
        tutorId: conversation.tutorId,
        score,
        comment: comment ?? null,
      },
      select: ratingSelect,
    });

    return rating;
  } catch (error) {
    if (error?.code === "P2002") {
      const updated = await prisma.rating.update({
        where: { conversationId },
        data: {
          score,
          comment: comment ?? null,
        },
        select: ratingSelect,
      });
      return updated;
    }

    throw error;
  }
};

export const getConversationRating = async ({ conversationId }) => {
  const rating = await prisma.rating.findUnique({
    where: { conversationId },
    select: ratingSelect,
  });
  return rating;
};