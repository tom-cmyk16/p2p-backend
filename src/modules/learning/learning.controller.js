import {
  createCourse as createCourseRecord,
  getMyLearningAccess,
  listCourses as listCourseRecords,
  updateCourse as updateCourseRecord,
  deleteCourse as deleteCourseRecord,
  provisionPackage as provisionPackageRecord,
  updateCourseCompletion as updateCourseCompletionRecord,
  listManagedLearningMaterials as listManagedLearningMaterialRecords,
  createLearningMaterial as createLearningMaterialRecord,
  updateLearningMaterial as updateLearningMaterialRecord,
  deleteLearningMaterial as deleteLearningMaterialRecord,
  listStudentLearningMaterials as listStudentLearningMaterialRecords,
} from "./learning.service.js";

export const listCourses = async (req, res, next) => {
  try {
    return res.status(200).json(await listCourseRecords());
  } catch (error) {
    next(error);
  }
};

export const createCourse = async (req, res, next) => {
  try {
    return res.status(201).json(await createCourseRecord(req.body));
  } catch (error) {
    next(error);
  }
};

export const updateCourse = async (req, res, next) => {
  try {
    return res.status(200).json(await updateCourseRecord({
      courseId: req.params.courseId,
      ...req.body,
    }));
  } catch (error) {
    next(error);
  }
};

export const deleteCourse = async (req, res, next) => {
  try {
    await deleteCourseRecord(req.params.courseId);
    return res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const issuePackage = async (req, res, next) => {
  try {
    return res.status(201).json(
      await provisionPackageRecord({
        ...req.body,
        adminId: req.user.id,
      })
    );
  } catch (error) {
    next(error);
  }
};

export const setCourseCompletion = async (req, res, next) => {
  try {
    return res.status(200).json(
      await updateCourseCompletionRecord({
        studentId: req.params.studentId,
        courseId: req.params.courseId,
        completed: req.body.completed,
        adminId: req.user.id,
      })
    );
  } catch (error) {
    next(error);
  }
};

export const getLearningAccess = async (req, res, next) => {
  try {
    return res.status(200).json(await getMyLearningAccess(req.user.id));
  } catch (error) {
    console.error("[learning.controller.getLearningAccess] Error fetching learning access for user:", req.user?.id, error);
    next(error);
  }
};

export const listManagedLearningMaterials = async (req, res, next) => {
  try {
    return res.status(200).json(await listManagedLearningMaterialRecords());
  } catch (error) {
    next(error);
  }
};

export const createLearningMaterial = async (req, res, next) => {
  try {
    return res.status(201).json(await createLearningMaterialRecord({
      ...req.body,
      createdById: req.user.id,
    }));
  } catch (error) {
    next(error);
  }
};

export const updateLearningMaterial = async (req, res, next) => {
  try {
    return res.status(200).json(await updateLearningMaterialRecord({
      materialId: req.params.materialId,
      ...req.body,
    }));
  } catch (error) {
    next(error);
  }
};

export const deleteLearningMaterial = async (req, res, next) => {
  try {
    await deleteLearningMaterialRecord(req.params.materialId);
    return res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const listStudentLearningMaterials = async (req, res, next) => {
  try {
    return res.status(200).json(await listStudentLearningMaterialRecords({
      studentId: req.user.id,
      courseId: req.query.courseId,
    }));
  } catch (error) {
    next(error);
  }
};
