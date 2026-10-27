import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware.js";
import {
  validate,
  validateParams,
} from "../../middlewares/validate.middleware.js";

import { createRating, getRating } from "./ratings.controller.js";

import {
  conversationIdParamSchema,
  createRatingSchema,
} from "./ratings.validation.js";

const router = Router();

router.get(
  "/:conversationId/rating",
  authenticate,
  validateParams(conversationIdParamSchema),
  getRating
);

router.post(
  "/:conversationId/rating",
  authenticate,
  validateParams(conversationIdParamSchema),
  validate(createRatingSchema),
  createRating
);

export default router;