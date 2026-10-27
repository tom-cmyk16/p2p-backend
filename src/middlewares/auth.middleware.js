import jwt from "jsonwebtoken";
import { prisma } from "../config/db.js";

export const authenticate = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      const error = new Error("Authentication token is required");
      error.statusCode = 401;
      error.code = "UNAUTHORIZED";

      return next(error);
    }

    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      const error = new Error("Invalid authorization header");
      error.statusCode = 401;
      error.code = "UNAUTHORIZED";

      return next(error);
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await prisma.user.findUnique({
      where: {
        id: decoded.id,
      },
      select: {
        id: true,
        fullName: true,
        phoneOrEmail: true,
        role: true,
        status: true,
        regionId: true,
      },
    });

    if (!user) {
      const error = new Error(
        "User associated with this token no longer exists"
      );

      error.statusCode = 401;
      error.code = "UNAUTHORIZED";

      return next(error);
    }

    if (
      user.status === "SUSPENDED" ||
      user.status === "BANNED"
    ) {
      const error = new Error("Account is suspended or banned");

      error.statusCode = 403;
      error.code = "FORBIDDEN";

      return next(error);
    }

    req.user = user;

    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError" ||
      error.name === "NotBeforeError"
    ) {
      const authError = new Error(
        "Invalid or expired authentication token"
      );

      authError.statusCode = 401;
      authError.code = "UNAUTHORIZED";

      return next(authError);
    }

    next(error);
  }
};

export const optionalAuthenticate = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;
    if (!authorization) {
      return next();
    }

    const [scheme, token] = authorization.split(" ");
    if (scheme !== "Bearer" || !token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        fullName: true,
        phoneOrEmail: true,
        role: true,
        status: true,
        regionId: true,
      },
    });

    if (user && user.status !== "SUSPENDED" && user.status !== "BANNED") {
      req.user = user;
    }
    return next();
  } catch (_error) {
    return next();
  }
};