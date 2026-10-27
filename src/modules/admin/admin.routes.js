import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/requireRole.middleware.js";
import {
  validate,
  validateQuery,
  validateParams,
} from "../../middlewares/validate.middleware.js";

import {
  adminDashboardOverview,
  listTutorApplications,
  getApplicationDocument,
  approveApplication,
  rejectApplication,
  listReports,
  changeReportStatus,
  changeUserStatus,
  getUsersList,
  verifyTutorPhoneCall,
  getReportDetails,
  listReplacementTutors,
  reassignReportMentor,
} from "./admin.controller.js";

import {
  adminTutorApplicationsQuerySchema,
  applicationDocumentParamsSchema,
  applicationIdParamSchema,
  rejectTutorApplicationSchema,
  adminReportsQuerySchema,
  reportIdParamSchema,
  updateReportSchema,
  userIdParamSchema,
  updateUserStatusSchema,
  adminUsersQuerySchema,
  reassignTutorSchema,
} from "./admin.validation.js";

const router = Router();

const adminOnly = [
  authenticate,
  requireRole("ADMIN"),
];

router.get("/dashboard", ...adminOnly, adminDashboardOverview);

/*
|--------------------------------------------------------------------------
| Tutor Applications
|--------------------------------------------------------------------------
*/

router.get("/tutor-applications", ...adminOnly,
  validateQuery(adminTutorApplicationsQuerySchema),
  listTutorApplications
);

router.get(
  "/tutor-applications/:applicationId/documents/:documentId",
  ...adminOnly,
  validateParams(applicationDocumentParamsSchema),
  getApplicationDocument
);

router.patch("/tutor-applications/:applicationId/approve",...adminOnly,
  validateParams(applicationIdParamSchema),
  approveApplication
);

router.patch("/tutor-applications/:applicationId/reject",...adminOnly,
  validateParams(applicationIdParamSchema),
  validate(rejectTutorApplicationSchema),
  rejectApplication
);

/*
|--------------------------------------------------------------------------
| Reports & Mentor Reassignment
|--------------------------------------------------------------------------
*/

router.get("/reports", ...adminOnly,
  validateQuery(adminReportsQuerySchema),
  listReports
);

router.get("/reports/:reportId", ...adminOnly,
  validateParams(reportIdParamSchema),
  getReportDetails
);

router.patch("/reports/:reportId", ...adminOnly,
  validateParams(reportIdParamSchema),
  validate(updateReportSchema),
  changeReportStatus
);

router.get("/reports/:reportId/replacement-tutors", ...adminOnly,
  validateParams(reportIdParamSchema),
  listReplacementTutors
);

router.post("/reports/:reportId/reassign-tutor", ...adminOnly,
  validateParams(reportIdParamSchema),
  validate(reassignTutorSchema),
  reassignReportMentor
);

/*
|--------------------------------------------------------------------------
| Users & Verification
|--------------------------------------------------------------------------
*/

router.get("/users", ...adminOnly,
  validateQuery(adminUsersQuerySchema),
  getUsersList
);

router.patch("/users/:userId/status", ...adminOnly,
  validateParams(userIdParamSchema),
  validate(updateUserStatusSchema),
  changeUserStatus
);

router.patch("/users/:userId/verify-call", ...adminOnly,
  validateParams(userIdParamSchema),
  verifyTutorPhoneCall
);

export default router;