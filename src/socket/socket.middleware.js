import jwt from "jsonwebtoken";

export function socketAuth(socket, next) {
  let token = socket.handshake.auth?.token || socket.handshake.headers?.authorization;

  if (!token) {
    return next(new Error("UNAUTHORIZED"));
  }

  if (typeof token === "string" && token.startsWith("Bearer ")) {
    token = token.slice(7).trim();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    socket.user = decoded;

    next();
  } catch (error) {
    next(new Error("UNAUTHORIZED"));
  }
}