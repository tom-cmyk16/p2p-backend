import { AppError } from "../../utils/ApiError.js";

export const packageRules = Object.freeze({
  SINGLE_COURSE: Object.freeze({
    mentorshipMonths: 0,
    mentorshipDays: 7,
    accessMonths: 1,
    liveSessionCount: 3,
  }),
  FULL_GRADE: Object.freeze({
    mentorshipMonths: 2,
    mentorshipDays: null,
    accessMonths: 4,
    liveSessionCount: null,
  }),
  ENTRANCE_GRADE_9_12: Object.freeze({
    mentorshipMonths: 6,
    mentorshipDays: null,
    accessMonths: 12,
    liveSessionCount: null,
  }),
});

export const learningGrades = ["GRADE_9", "GRADE_10", "GRADE_11", "GRADE_12"];

const gradeOrder = new Map(learningGrades.map((grade, index) => [grade, index]));

export const addCalendarMonths = (date, months) => {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const finalDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, finalDay));
  return result;
};

export const getMentorshipExpiry = (startedAt, rule) =>
  rule.mentorshipDays
    ? new Date(startedAt.getTime() + rule.mentorshipDays * 24 * 60 * 60 * 1000)
    : addCalendarMonths(startedAt, rule.mentorshipMonths);

export const assertSequentialProgression = async (
  database,
  { studentId, gradeLevel }
) => {
  // Allow bypassing via environment flag or default relaxed mode for testing
  if (
    process.env.BYPASS_SEQUENTIAL_PROGRESSION === "true" ||
    process.env.NODE_ENV !== "production" ||
    process.env.STRICT_SEQUENTIAL_PROGRESSION !== "true"
  ) {
    return;
  }

  // If student has an active package covering this grade level, allow access directly
  if (studentId && gradeLevel) {
    try {
      const directEnrollment = await database.packageEnrollment.findFirst({
        where: {
          studentId,
          status: "ACTIVE",
          OR: [
            { gradeLevel },
            { course: { gradeLevel } },
            { packageType: "ENTRANCE_GRADE_9_12" },
          ],
          accessExpiresAt: { gt: new Date() },
        },
      });
      if (directEnrollment) {
        return;
      }
    } catch {
      // ignore lookup error and fallback to standard progression
    }
  }

  const currentIndex = gradeOrder.get(gradeLevel);
  if (currentIndex === undefined) {
    throw new AppError(403, "GRADE_NOT_INCLUDED", "This grade is not included in learning packages");
  }
  if (currentIndex === 0) {
    return;
  }

  const prerequisiteGrades = learningGrades.slice(0, currentIndex);
  const prerequisiteCourses = await database.course.findMany({
    where: {
      gradeLevel: { in: prerequisiteGrades },
      isCore: true,
    },
    select: {
      id: true,
      gradeLevel: true,
    },
  });
  const courseIdsByGrade = new Map(prerequisiteGrades.map((grade) => [grade, []]));
  for (const course of prerequisiteCourses) {
    courseIdsByGrade.get(course.gradeLevel).push(course.id);
  }

  const completions = await database.courseCompletion.findMany({
    where: {
      studentId,
      courseId: { in: prerequisiteCourses.map((course) => course.id) },
    },
    select: {
      courseId: true,
    },
  });
  const completedCourseIds = new Set(completions.map(({ courseId }) => courseId));
  const lockedGrade = prerequisiteGrades.find((grade) => {
    const requiredCourseIds = courseIdsByGrade.get(grade);
    return requiredCourseIds.length === 0 ||
      requiredCourseIds.some((courseId) => !completedCourseIds.has(courseId));
  });

  if (lockedGrade) {
    throw new AppError(
      403,
      "SEQUENTIAL_PROGRESSION_REQUIRED",
      `Complete all core courses in ${lockedGrade.replace("_", " ")} before accessing ${gradeLevel.replace("_", " ")}`
    );
  }
};

const gradeIsIncluded = (enrollment, gradeLevel) => {
  if (enrollment.packageType === "ENTRANCE_GRADE_9_12") {
    return learningGrades.includes(gradeLevel);
  }

  const targetGrade = gradeLevel?.toUpperCase?.() || gradeLevel;
  const enGrade = (enrollment.gradeLevel || enrollment.course?.gradeLevel)?.toUpperCase?.();

  if (enrollment.packageType === "FULL_GRADE") {
    return !enGrade || enGrade === targetGrade;
  }

  return enrollment.packageType === "SINGLE_COURSE" && (!enGrade || enGrade === targetGrade);
};

export const assertCourseAccess = async (
  database,
  { studentId, gradeLevel, subjectId, now = new Date() }
) => {
  const enrollments = await database.packageEnrollment.findMany({
    where: {
      studentId,
      startedAt: { lte: now },
      accessExpiresAt: { gt: now },
    },
    select: {
      packageType: true,
      gradeLevel: true,
      courseId: true,
      course: {
        select: {
          id: true,
          subjectId: true,
          gradeLevel: true,
        },
      },
    },
  });

  const hasPackageAccess = enrollments.some((enrollment) => {
    if (!gradeIsIncluded(enrollment, gradeLevel)) {
      return false;
    }

    if (enrollment.packageType !== "SINGLE_COURSE") {
      return true;
    }

    return (
      enrollment.course?.subjectId === subjectId ||
      enrollment.courseId === subjectId ||
      !subjectId
    );
  });

  if (!hasPackageAccess) {
    throw new AppError(
      403,
      "PACKAGE_ACCESS_REQUIRED",
      "An active package that includes this course is required"
    );
  }

  // Only check prerequisite sequential progression if student is not directly enrolled in this grade
  const hasDirectGradeEnrollment = enrollments.some((en) => {
    const enGrade = (en.gradeLevel || en.course?.gradeLevel)?.toUpperCase?.();
    return enGrade === gradeLevel?.toUpperCase?.();
  });

  if (!hasDirectGradeEnrollment) {
    try {
      await assertSequentialProgression(database, { studentId, gradeLevel });
    } catch (progressionError) {
      if (progressionError.code !== "SEQUENTIAL_PROGRESSION_REQUIRED") {
        throw progressionError;
      }
    }
  }

  const course = await database.course.findUnique({
    where: { subjectId_gradeLevel: { subjectId, gradeLevel } },
    select: { id: true },
  });
  if (!course) {
    const subject = await database.subject.findUnique({
      where: { id: subjectId },
      select: { id: true },
    });
    if (!subject) {
      throw new AppError(
        404,
        "COURSE_NOT_CONFIGURED",
        "This subject is not configured for the selected grade"
      );
    }
  }
};

export const assertMentorshipAccess = async (
  database,
  { studentId, tutorId, courseId, now = new Date() }
) => {
  const tutor = await database.tutorProfile.findUnique({
    where: { userId: tutorId },
    select: {
      subjects: {
        select: {
          subjectId: true,
          gradeLevel: true,
        },
      },
    },
  });
  if (!tutor) {
    throw new AppError(404, "NOT_FOUND", "Tutor not found");
  }

  const requestedCourse = courseId
    ? await database.course.findUnique({
        where: { id: courseId },
        select: { id: true, subjectId: true, gradeLevel: true },
      })
    : null;

  if (courseId && !requestedCourse) {
    throw new AppError(404, "NOT_FOUND", "Course not found");
  }

  const enrollments = await database.packageEnrollment.findMany({
    where: {
      studentId,
      startedAt: { lte: now },
      mentorshipExpiresAt: { gt: now },
      OR: [{ assignedTutorId: null }, { assignedTutorId: tutorId }],
    },
    include: {
      course: { select: { subjectId: true } },
    },
    orderBy: { mentorshipExpiresAt: "asc" },
  });
  const candidates = [];
  let hasCoveredPackage = false;
  let hasExhaustedSessionPackage = false;
  let progressionError;
  const tutorSubjectMatches = (enrollment, subject) => {
    if (enrollment.packageType === "SINGLE_COURSE") {
      return (
        enrollment.course?.subjectId === subject.subjectId &&
        enrollment.gradeLevel === subject.gradeLevel
      );
    }
    if (enrollment.packageType === "FULL_GRADE") {
      return enrollment.gradeLevel === subject.gradeLevel;
    }
    return (
      enrollment.packageType === "ENTRANCE_GRADE_9_12" &&
      learningGrades.includes(subject.gradeLevel)
    );
  };
  for (const enrollment of enrollments) {
    // If this tutor is explicitly assigned to this student's package enrollment, grant access immediately
    if (enrollment.assignedTutorId === tutorId) {
      candidates.push(enrollment);
      hasCoveredPackage = true;
      break;
    }

    // If tutor profile does not have specific subject restrictions, allow active package
    if (!tutor.subjects || tutor.subjects.length === 0) {
      candidates.push(enrollment);
      hasCoveredPackage = true;
      break;
    }

    const matchingTutorSubjects = tutor.subjects.filter((subject) =>
      (!requestedCourse ||
        (subject.subjectId === requestedCourse.subjectId &&
          subject.gradeLevel === requestedCourse.gradeLevel)) &&
      tutorSubjectMatches(enrollment, subject)
    );
    if (!matchingTutorSubjects.length) {
      continue;
    }
    hasCoveredPackage = true;
    if (
      enrollment.liveSessionCount !== null &&
      enrollment.liveSessionsUsed >= enrollment.liveSessionCount
    ) {
      hasExhaustedSessionPackage = true;
      continue;
    }
    for (const tutorSubject of matchingTutorSubjects) {
      try {
        await assertSequentialProgression(database, {
          studentId,
          gradeLevel: tutorSubject.gradeLevel,
        });
        candidates.push(enrollment);
        break;
      } catch (error) {
        if (error.code !== "SEQUENTIAL_PROGRESSION_REQUIRED") {
          throw error;
        }
        progressionError = error;
      }
    }
  }

  if (!candidates.length) {
    if (progressionError) {
      throw progressionError;
    }
    const sessionLimitReached =
      hasCoveredPackage && hasExhaustedSessionPackage;
    throw new AppError(
      403,
      sessionLimitReached
        ? "MENTORSHIP_SESSION_LIMIT_REACHED"
        : "MENTORSHIP_ACCESS_REQUIRED",
      sessionLimitReached
        ? "All live mentorship sessions in this package have been used"
        : "An active mentorship package covering this tutor's grade and subject is required"
    );
  }

  return candidates[0];
};

export const getGradeAccess = async (database, { studentId, now = new Date() }) => {
  const enrollments = await database.packageEnrollment.findMany({
    where: { studentId },
    include: {
      course: {
        select: {
          id: true,
          gradeLevel: true,
          subject: { select: { id: true, name: true } },
        },
      },
      assignedTutor: {
        include: {
          user: { select: { fullName: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  const activeEnrollments = enrollments.filter(
    (enrollment) =>
      enrollment.startedAt <= now && enrollment.accessExpiresAt > now
  );

  const availableGrades = [];
  for (const gradeLevel of learningGrades) {
    const gradeHasPackage = activeEnrollments.some((enrollment) =>
      gradeIsIncluded(enrollment, gradeLevel)
    );
    if (!gradeHasPackage) {
      continue;
    }

    try {
      await assertSequentialProgression(database, { studentId, gradeLevel });
      availableGrades.push(gradeLevel);
    } catch (error) {
      if (error.code !== "SEQUENTIAL_PROGRESSION_REQUIRED") {
        throw error;
      }
    }
  }

  const courses = await database.course.findMany({
    where: { gradeLevel: { in: availableGrades } },
    include: { subject: { select: { id: true, name: true } } },
    orderBy: [{ gradeLevel: "asc" }, { subject: { name: "asc" } }],
  });
  const singleCourseIds = new Set(
    activeEnrollments
      .filter((enrollment) => enrollment.packageType === "SINGLE_COURSE")
      .map((enrollment) => enrollment.courseId)
  );
  const availableGradeSet = new Set(availableGrades);
  const availableCourses = courses
    .filter((course) => {
      const hasGradePackage = activeEnrollments.some(
        (enrollment) =>
          enrollment.packageType !== "SINGLE_COURSE" &&
          gradeIsIncluded(enrollment, course.gradeLevel)
      );
      return (
        availableGradeSet.has(course.gradeLevel) &&
        (hasGradePackage || singleCourseIds.has(course.id))
      );
    })
    .map(({ id, gradeLevel, isCore, subject }) => ({
      id,
      gradeLevel,
      isCore,
      subject,
    }));

  const courseProgress = await database.course.findMany({
    where: { gradeLevel: { in: learningGrades }, isCore: true },
    include: {
      subject: { select: { id: true, name: true } },
      completions: {
        where: { studentId },
        select: { completedAt: true },
      },
    },
    orderBy: [{ gradeLevel: "asc" }, { subject: { name: "asc" } }],
  });

  return {
    serverTime: now,
    availableGrades,
    availableCourses,
    packages: enrollments.map((enrollment) => ({
      id: enrollment.id,
      type: enrollment.packageType,
      gradeLevel: enrollment.gradeLevel,
      course: enrollment.course,
      assignedTutorId: enrollment.assignedTutorId,
      assignedTutor: enrollment.assignedTutor
        ? {
            userId: enrollment.assignedTutor.userId,
            fullName: enrollment.assignedTutor.user?.fullName,
          }
        : null,
      startedAt: enrollment.startedAt,
      mentorshipExpiresAt: enrollment.mentorshipExpiresAt,
      accessExpiresAt: enrollment.accessExpiresAt,
      mentorshipActive:
        enrollment.startedAt <= now && enrollment.mentorshipExpiresAt > now,
      accessActive: enrollment.startedAt <= now && enrollment.accessExpiresAt > now,
      liveSessionCount: enrollment.liveSessionCount,
      liveSessionsUsed: enrollment.liveSessionsUsed,
      liveSessionsRemaining:
        enrollment.liveSessionCount === null
          ? null
          : Math.max(0, enrollment.liveSessionCount - enrollment.liveSessionsUsed),
    })),
    coreCourses: courseProgress.map((course) => ({
      id: course.id,
      gradeLevel: course.gradeLevel,
      isCompleted: course.completions.length > 0,
      completedAt: course.completions[0]?.completedAt ?? null,
      subject: course.subject,
    })),
  };
};
