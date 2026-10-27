import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/requireRole.middleware.js";
import {
  validate,
  validateParams,
  validateQuery,
} from "../../middlewares/validate.middleware.js";
import {
  commissionSchema,
  markPayoutPaidSchema,
  payoutParamsSchema,
  revenueDashboardQuerySchema,
  updateOfferSchema,
} from "./payments.validation.js";
import {
  revenueDashboard,
  listAdminOffers,
  saveCommission,
  saveOffer,
  settlePayout,
} from "./payments.controller.js";

const router = Router();
const adminOnly = [authenticate, requireRole("ADMIN")];

router.get("/", ...adminOnly, validateQuery(revenueDashboardQuerySchema), revenueDashboard);
router.get("/offers", ...adminOnly, listAdminOffers);
router.put("/offers", ...adminOnly, validate(updateOfferSchema), saveOffer);
router.put("/commission", ...adminOnly, validate(commissionSchema), saveCommission);
router.patch(
  "/payouts/:payoutId/paid",
  ...adminOnly,
  validateParams(payoutParamsSchema),
  validate(markPayoutPaidSchema),
  settlePayout,
);

export default router;
