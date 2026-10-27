import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import { createReport } from "./reports.controller.js";
import { createReportSchema } from "./reports.validation.js";

const router = Router();

router.post(
  "/",
  authenticate,
  validate(createReportSchema),
  createReport
);

export default router;