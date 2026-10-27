import {
  registerUser,
  loginUser,
} from "./auth.service.js";

export const register = async (req, res, next) => {
  try {
    const result = await registerUser(req.body);

    res.status(201).json({
      ...result,
      message: result.user.role === "TUTOR"
        ? "Your tutor account has been created. Sign in to complete your application."
        : "Your student account has been created. Sign in to continue.",
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await loginUser(req.body);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { requestPasswordReset } = await import("./auth.service.js");
    const result = await requestPasswordReset(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { resetPasswordWithToken } = await import("./auth.service.js");
    const result = await resetPasswordWithToken(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};