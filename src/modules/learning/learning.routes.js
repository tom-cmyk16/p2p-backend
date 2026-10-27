import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/requireRole.middleware.js";
import {
  validate,
  validateParams,
  validateQuery,
} from "../../middlewares/validate.middleware.js";
import {
  createCourse,
  getLearningAccess,
  issuePackage,
  listCourses,
  updateCourse,
  deleteCourse,
  setCourseCompletion,
  listManagedLearningMaterials,
  createLearningMaterial,
  updateLearningMaterial,
  deleteLearningMaterial,
  listStudentLearningMaterials,
} from "./learning.controller.js";
import {
  courseCompletionSchema,
  createCourseSchema,
  updateCourseSchema,
  courseIdParamsSchema,
  provisionPackageSchema,
  studentCourseParamsSchema,
  createLearningMaterialSchema,
  updateLearningMaterialSchema,
  learningMaterialIdParamsSchema,
  studentMaterialsQuerySchema,
} from "./learning.validation.js";

const router = Router();
const adminOnly = [authenticate, requireRole("ADMIN")];

router.get("/access", authenticate, requireRole("STUDENT"), getLearningAccess);
router.get(
  "/materials",
  authenticate,
  requireRole("STUDENT"),
  validateQuery(studentMaterialsQuerySchema),
  listStudentLearningMaterials
);
router.get("/materials/manage", ...adminOnly, listManagedLearningMaterials);
router.post(
  "/materials",
  ...adminOnly,
  validate(createLearningMaterialSchema),
  createLearningMaterial
);
router.patch(
  "/materials/:materialId",
  ...adminOnly,
  validateParams(learningMaterialIdParamsSchema),
  validate(updateLearningMaterialSchema),
  updateLearningMaterial
);
router.delete(
  "/materials/:materialId",
  ...adminOnly,
  validateParams(learningMaterialIdParamsSchema),
  deleteLearningMaterial
);
router.get("/courses", ...adminOnly, listCourses);
router.post("/courses", ...adminOnly, validate(createCourseSchema), createCourse);
router.patch(
  "/courses/:courseId",
  ...adminOnly,
  validateParams(courseIdParamsSchema),
  validate(updateCourseSchema),
  updateCourse
);
router.delete(
  "/courses/:courseId",
  ...adminOnly,
  validateParams(courseIdParamsSchema),
  deleteCourse
);
router.post(
  "/packages",
  ...adminOnly,
  validate(provisionPackageSchema),
  issuePackage
);
router.patch(
  "/students/:studentId/courses/:courseId/completion",
  ...adminOnly,
  validateParams(studentCourseParamsSchema),
  validate(courseCompletionSchema),
  setCourseCompletion
);

export default router;
