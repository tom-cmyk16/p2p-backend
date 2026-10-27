import { prisma } from "../config/db.js";

export function registerConversationSocketHandlers(io, socket) {
  socket.on("session:join", async (sessionId) => {
    try {
      if (typeof sessionId !== "string" || !sessionId) {
        return socket.emit("error", {
          code: "VALIDATION_ERROR",
          message: "sessionId is required",
        });
      }

      const session = await prisma.mentorshipSession.findUnique({
        where: { id: sessionId },
        select: { id: true, studentId: true, tutorId: true },
      });
      if (!session) {
        return socket.emit("error", {
          code: "NOT_FOUND",
          message: "Mentorship session not found",
        });
      }
      if (session.studentId !== socket.user.id && session.tutorId !== socket.user.id) {
        return socket.emit("error", {
          code: "FORBIDDEN",
          message: "You are not a participant in this mentorship session",
        });
      }
      socket.join(`session:${sessionId}`);
    } catch (error) {
      console.error("session:join error:", error);
      socket.emit("error", {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to join the mentorship session",
      });
    }
  });

  socket.on("session:leave", (sessionId) => {
    if (typeof sessionId === "string" && sessionId) {
      socket.leave(`session:${sessionId}`);
    }
  });

  socket.on("conversation:join", async (conversationId) => {
    try {
      if (!conversationId) {
        return socket.emit("error", {
          code: "VALIDATION_ERROR",
          message: "conversationId is required",
        });
      }

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
        return socket.emit("error", {
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      const isParticipant =
        conversation.studentId === socket.user.id ||
        conversation.tutorId === socket.user.id;

      if (!isParticipant) {
        return socket.emit("error", {
          code: "FORBIDDEN",
          message: "You are not a participant in this conversation",
        });
      }

      socket.join(conversationId);
    } catch (error) {
      console.error("conversation:join error:", error);

      socket.emit("error", {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to join conversation",
      });
    }
  });

  socket.on("conversation:leave", (conversationId) => {
    if (!conversationId) {
      return;
    }

    socket.leave(conversationId);
  });

  socket.on(
    "message:markRead",
    async ({ conversationId, messageId }) => {
      try {
        if (!conversationId || !messageId) {
          return socket.emit("error", {
            code: "VALIDATION_ERROR",
            message: "conversationId and messageId are required",
          });
        }

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
          return socket.emit("error", {
            code: "NOT_FOUND",
            message: "Conversation not found",
          });
        }

        const isParticipant =
          conversation.studentId === socket.user.id ||
          conversation.tutorId === socket.user.id;

        if (!isParticipant) {
          return socket.emit("error", {
            code: "FORBIDDEN",
            message: "You are not a participant in this conversation",
          });
        }

        const message = await prisma.message.findUnique({
          where: {
            id: messageId,
          },
          select: {
            id: true,
            conversationId: true,
            senderId: true,
            status: true,
          },
        });

        if (!message) {
          return socket.emit("error", {
            code: "NOT_FOUND",
            message: "Message not found",
          });
        }

        if (message.conversationId !== conversationId) {
          return socket.emit("error", {
            code: "VALIDATION_ERROR",
            message: "Message does not belong to this conversation",
          });
        }

        const updatedMessage = await prisma.message.update({
          where: {
            id: messageId,
          },
          data: {
            status: "READ",
          },
        });

        io.to(conversationId).emit("message:statusUpdate", {
          messageId: updatedMessage.id,
          status: "READ",
        });
      } catch (error) {
        console.error("message:markRead error:", error);

        socket.emit("error", {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to mark message as read",
        });
      }
    }
  );
}