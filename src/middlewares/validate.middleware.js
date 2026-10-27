import { AppError } from "../utils/ApiError.js";

export const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      console.error(`[request-validation] ${req.method} ${req.originalUrl}`, {
        details,
        issues: result.error.issues,
      });

      return next(
        new AppError(
          422,
          "VALIDATION_ERROR",
          "Request validation failed",
          details
        )
      );
    }

    req.body = result.data;
    next();
  };
};

export const validateQuery = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      console.error(`[request-validation] ${req.method} ${req.originalUrl} (query)`, {
        details,
        issues: result.error.issues,
      });

      return next(
        new AppError(
          422,
          "VALIDATION_ERROR",
          "Request validation failed",
          details
        )
      );
    }

    next();
  };
};


export const validateParams = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      console.error(`[request-validation] ${req.method} ${req.originalUrl} (params)`, {
        details,
        issues: result.error.issues,
      });

      return next(
        new AppError(
          422,
          "VALIDATION_ERROR",
          "Request validation failed",
          details
        )
      );
    }

    next();
  };
};