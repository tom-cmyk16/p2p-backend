import { AppError } from "../utils/ApiError.js";

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(
        new AppError(
          401,
          "UNAUTHORIZED",
          "Authentication is required"
        )
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          403,
          "FORBIDDEN",
          "You do not have permission to access this resource"
        )
      );
    }

    next();
  };
};