import express from "express";
import rateLimit from "express-rate-limit";
import { register, login, forgotPassword, resetPassword } from "./auth.controller.js";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth.validation.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();

const authRateLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || process.env.RATE_LIMIT_WINDOW_MS || 900000),
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX || process.env.RATE_LIMIT_MAX || 100),
  standardHeaders: "draft-8",
  legacyHeaders: false,

  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many authentication attempts. Please try again later.",
      },
    });
  },
});

router.post("/register", authRateLimiter, validate(registerSchema), register);
router.post("/login", authRateLimiter, validate(loginSchema), login);
router.post(
  "/forgot-password",
  authRateLimiter,
  validate(forgotPasswordSchema),
  forgotPassword
);
router.post(
  "/reset-password",
  authRateLimiter,
  validate(resetPasswordSchema),
  resetPassword
);

router.get("/test-auth", authenticate, (req, res) => {
  res.status(200).json({
    message: "Authentication middleware works",
    user: req.user,
  });
});



export default router;