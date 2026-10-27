import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";
import {
  addCalendarMonths,
  assertCourseAccess,
  getGradeAccess,
  getMentorshipExpiry,
  learningGrades,
  packageRules,
} from "./learning.rules.js";

const courseSelect = {
  id: true,
  gradeLevel: true,
  isCore: true,
  contentAccessDays: true,
  mentorshipDurationDays: true,
  subject: { select: { id: true, name: true } },
};

export const listCourses = async () => {
  const courses = await prisma.course.findMany({
    select: courseSelect,
    orderBy: [{ gradeLevel: "asc" }, { subject: { name: "asc" } }],
  });
  return courses.map((course) => ({
    ...course,
    contentAccessDays: course.contentAccessDays ?? 30,
    mentorshipDurationDays: course.mentorshipDurationDays ?? 7,
  }));
};

export const createCourse = async ({
  subjectId,
  gradeLevel,
  isCore,
  contentAccessDays = 30,
  mentorshipDurationDays = 7,
}) => {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true },
  });
  if (!subject) {
    throw new AppError(404, "NOT_FOUND", "Subject not found");
  }

  try {
    return await prisma.course.create({
      data: {
        subjectId,
        gradeLevel,
        isCore,
        contentAccessDays: Number(contentAccessDays) || 30,
        mentorshipDurationDays: Number(mentorshipDurationDays) || 7,
      },
      select: courseSelect,
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError(409, "CONFLICT", "A course for this subject and grade already exists");
    }
    throw error;
  }
};

export const updateCourse = async ({
  courseId,
  subjectId,
  gradeLevel,
  isCore,
  contentAccessDays,
  mentorshipDurationDays,
}) => {
  const existing = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, subjectId: true, gradeLevel: true },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Course not found");
  if (existing.subjectId !== subjectId || existing.gradeLevel !== gradeLevel) {
    const [enrollments, completions, series, sessions, offers, payments, materials] = await Promise.all([
      prisma.packageEnrollment.count({ where: { courseId } }),
      prisma.courseCompletion.count({ where: { courseId } }),
      prisma.mentorshipSeries.count({ where: { courseId } }),
      prisma.mentorshipSession.count({ where: { courseId } }),
      prisma.packageOffer.count({ where: { courseId } }),
      prisma.payment.count({ where: { courseId } }),
      prisma.learningMaterial.count({ where: { courseId } }),
    ]);
    if (enrollments || completions || series || sessions || offers || payments || materials) {
      throw new AppError(
        409,
        "COURSE_IN_USE",
        "The subject or grade of a course cannot change after it is used by enrollments, payments, sessions, offers, completions, or learning materials"
      );
    }
  }
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true },
  });
  if (!subject) throw new AppError(404, "NOT_FOUND", "Subject not found");

  try {
    return await prisma.course.update({
      where: { id: courseId },
      data: {
        subjectId,
        gradeLevel,
        isCore,
        ...(contentAccessDays !== undefined ? { contentAccessDays: Number(contentAccessDays) || 30 } : {}),
        ...(mentorshipDurationDays !== undefined ? { mentorshipDurationDays: Number(mentorshipDurationDays) || 7 } : {}),
      },
      select: courseSelect,
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError(409, "CONFLICT", "A course for this subject and grade already exists");
    }
    if (error?.code === "P2025") throw new AppError(404, "NOT_FOUND", "Course not found");
    throw error;
  }
};

export const deleteCourse = async (courseId) => {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true },
  });
  if (!course) throw new AppError(404, "NOT_FOUND", "Course not found");
  const [enrollments, completions, series, sessions, offers, payments, materials] = await Promise.all([
    prisma.packageEnrollment.count({ where: { courseId } }),
    prisma.courseCompletion.count({ where: { courseId } }),
    prisma.mentorshipSeries.count({ where: { courseId } }),
    prisma.mentorshipSession.count({ where: { courseId } }),
    prisma.packageOffer.count({ where: { courseId } }),
    prisma.payment.count({ where: { courseId } }),
    prisma.learningMaterial.count({ where: { courseId } }),
  ]);
  const activeOffers = await prisma.packageOffer.count({ where: { courseId, active: true } });
  if (enrollments || completions || series || sessions || payments || materials || activeOffers) {
    throw new AppError(
      409,
      "COURSE_IN_USE",
      "A course with enrollments, payments, sessions, active offers, or completions cannot be deleted"
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.packageOffer.deleteMany({ where: { courseId, active: false } });
    await tx.course.delete({ where: { id: courseId } });
  });
};

const learningMaterialSelect = {
  id: true,
  courseId: true,
  topicId: true,
  title: true,
  description: true,
  url: true,
  isPublished: true,
  createdAt: true,
  updatedAt: true,
  course: {
    select: {
      id: true,
      gradeLevel: true,
      subject: { select: { id: true, name: true } },
    },
  },
  topic: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
};

const validateMaterialLocation = async ({ courseId, topicId }) => {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, subjectId: true },
  });
  if (!course) throw new AppError(404, "NOT_FOUND", "Course not found");
  if (topicId) {
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      select: { subjectId: true },
    });
    if (!topic) throw new AppError(404, "NOT_FOUND", "Topic not found");
    if (topic.subjectId !== course.subjectId) {
      throw new AppError(422, "VALIDATION_ERROR", "The selected topic does not belong to the course subject");
    }
  }
};

export const listManagedLearningMaterials = () =>
  prisma.learningMaterial.findMany({
    select: learningMaterialSelect,
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
  });

export const createLearningMaterial = async ({ createdById, ...data }) => {
  await validateMaterialLocation(data);
  return prisma.learningMaterial.create({
    data: { ...data, createdById },
    select: learningMaterialSelect,
  });
};

export const updateLearningMaterial = async ({ materialId, ...data }) => {
  await validateMaterialLocation(data);
  try {
    return await prisma.learningMaterial.update({
      where: { id: materialId },
      data,
      select: learningMaterialSelect,
    });
  } catch (error) {
    if (error?.code === "P2025") throw new AppError(404, "NOT_FOUND", "Learning material not found");
    throw error;
  }
};

export const deleteLearningMaterial = async (materialId) => {
  try {
    await prisma.learningMaterial.delete({ where: { id: materialId } });
  } catch (error) {
    if (error?.code === "P2025") throw new AppError(404, "NOT_FOUND", "Learning material not found");
    throw error;
  }
};

export const listStudentLearningMaterials = async ({ studentId, courseId }) => {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, subjectId: true, gradeLevel: true },
  });
  if (!course) throw new AppError(404, "NOT_FOUND", "Course not found");
  await assertCourseAccess(prisma, {
    studentId,
    subjectId: course.subjectId,
    gradeLevel: course.gradeLevel,
  });
  return prisma.learningMaterial.findMany({
    where: { courseId, isPublished: true },
    select: {
      id: true,
      courseId: true,
      topicId: true,
      title: true,
      description: true,
      url: true,
      topic: { select: { id: true, name: true } },
    },
    orderBy: [{ topic: { name: "asc" } }, { title: "asc" }],
  });
};

export const provisionPackage = async ({
  studentId,
  packageType,
  courseId,
  gradeLevel,
  adminId,
}) => {
  const student = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { userId: true },
  });
  if (!student) {
    throw new AppError(404, "NOT_FOUND", "Student profile not found");
  }

  const rule = packageRules[packageType];
  if (!rule) {
    throw new AppError(422, "VALIDATION_ERROR", "Unsupported package type");
  }
  let course = null;
  if (packageType === "SINGLE_COURSE") {
    course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, gradeLevel: true },
    });
    if (!course) {
      throw new AppError(404, "NOT_FOUND", "Course not found");
    }
  }
  if (packageType === "FULL_GRADE" && !learningGrades.includes(gradeLevel)) {
    throw new AppError(422, "VALIDATION_ERROR", "Full-grade packages are available for Grades 9 to 12");
  }

  const startedAt = new Date();
  const mentorshipExpiresAt = getMentorshipExpiry(startedAt, rule);
  const accessExpiresAt = addCalendarMonths(startedAt, rule.accessMonths);
  return prisma.packageEnrollment.create({
    data: {
      studentId,
      packageType,
      ...(course ? { courseId: course.id, gradeLevel: course.gradeLevel } : {}),
      ...(packageType === "FULL_GRADE" ? { gradeLevel } : {}),
      mentorshipMonths: rule.mentorshipMonths,
      accessMonths: rule.accessMonths,
      liveSessionCount: rule.liveSessionCount,
      startedAt,
      mentorshipExpiresAt,
      accessExpiresAt,
      provisionedById: adminId,
    },
    include: {
      course: {
        select: {
          id: true,
          gradeLevel: true,
          subject: { select: { id: true, name: true } },
        },
      },
    },
  });
};

export const getMyLearningAccess = async (studentId) => {
  try {
    return await getGradeAccess(prisma, { studentId });
  } catch (error) {
    console.error("[learning.service.getMyLearningAccess] Failed to load learning access for studentId:", studentId, error);
    throw error;
  }
};

export const updateCourseCompletion = async ({
  studentId,
  courseId,
  completed,
  adminId,
}) => {
  const student = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { userId: true },
  });
  if (!student) {
    throw new AppError(404, "NOT_FOUND", "Student profile not found");
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, gradeLevel: true, subjectId: true, isCore: true },
  });
  if (!course) {
    throw new AppError(404, "NOT_FOUND", "Course not found");
  }
  if (!course.isCore) {
    throw new AppError(422, "VALIDATION_ERROR", "Only core courses can be verified for grade progression");
  }

  if (completed) {
    await assertCourseAccess(prisma, {
      studentId,
      gradeLevel: course.gradeLevel,
      subjectId: course.subjectId,
    });
    return prisma.courseCompletion.upsert({
      where: { studentId_courseId: { studentId, courseId } },
      create: { studentId, courseId, completedById: adminId },
      update: { completedById: adminId, completedAt: new Date() },
      select: {
        id: true,
        studentId: true,
        courseId: true,
        completedById: true,
        completedAt: true,
      },
    });
  }

  await prisma.courseCompletion.deleteMany({ where: { studentId, courseId } });
  return { studentId, courseId, completed: false };
};
