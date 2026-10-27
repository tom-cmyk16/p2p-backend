import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/requireRole.middleware.js";
import { validate, validateParams, validateQuery } from "../../middlewares/validate.middleware.js";
import {
  checkoutSchema,
  paymentRefParamsSchema,
  tutorQuerySchema,
} from "./payments.validation.js";
import {
  chapaCallback,
  chapaWebhook,
  createCheckout,
  getTutorsForOffer,
  listOffers,
  myPayments,
  paymentStatus,
  verifyPayment,
} from "./payments.controller.js";

const router = Router();
const checkoutRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many checkout attempts. Please try again later.",
    },
  },
});
const verificationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many payment verification attempts. Please try again shortly.",
    },
  },
});

router.get("/callback", chapaCallback);
router.post("/callback", chapaWebhook);
router.post("/webhook", chapaWebhook);
router.get("/offers", authenticate, requireRole("STUDENT"), listOffers);
router.get("/mine", authenticate, requireRole("STUDENT"), myPayments);
router.get(
  "/tutors",
  authenticate,
  requireRole("STUDENT"),
  validateQuery(tutorQuerySchema),
  getTutorsForOffer,
);
router.post(
  "/checkout",
  authenticate,
  requireRole("STUDENT"),
  checkoutRateLimit,
  validate(checkoutSchema),
  createCheckout,
);
router.get(
  "/verify/:txRef",
  authenticate,
  requireRole("STUDENT"),
  verificationRateLimit,
  validateParams(paymentRefParamsSchema),
  verifyPayment,
);
router.get(
  "/:txRef",
  authenticate,
  requireRole("STUDENT"),
  validateParams(paymentRefParamsSchema),
  paymentStatus,
);

export default router;
