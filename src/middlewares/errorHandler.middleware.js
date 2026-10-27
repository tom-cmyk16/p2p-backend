export const errorHandler = (err, req, res, next) => {
  console.error(err);

  const statusCode = err.statusCode || 500;
  const code = err.code || "INTERNAL_ERROR";

  const response = {
    error: {
      code,
      message: err.message || "Internal server error",
    },
  };

  if (err.details) {
    response.error.details = err.details;
  }

  res.status(statusCode).json(response);
};