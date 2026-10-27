import { Server } from "socket.io";
import { socketAuth } from "./socket.middleware.js";
import { registerConversationSocketHandlers } from "./conversation.socket.js";

export function initializeSocket(httpServer) {
  const allowedOrigins = (
    process.env.FRONTEND_URL ||
    "http://localhost:5173,http://127.0.0.1:5173"
  )
    .split(",")
    .map((origin) => origin.trim());

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(socketAuth);

  io.on("connection", (socket) => {
    console.log("Socket connected");
    console.log("Authenticated user ID:", socket.user.id);
    console.log("Authenticated user role:", socket.user.role);

    registerConversationSocketHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(
        `Socket disconnected: ${socket.user.id}`,
        reason
      );
    });
  });

  return io;
}