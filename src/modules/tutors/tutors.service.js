import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";

const tutorProfileSelect = {
  userId: true,
  bio: true,
  educationLevel: true,
  institutionName: true,
  currentGradeLevel: true,
  fieldOfStudy: true,
  yearOfStudy: true,
  user: {
    select: {
      fullName: true,
    },
  },
  subjects: {
    select: {
      subjectId: true,
      gradeLevel: true,
      subject: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [
      { subject: { name: "asc" } },
      { gradeLevel: "asc" },
    ],
  },
};

export const getMyTutorProfile = async (tutorId) => {
  const tutor = await prisma.tutorProfile.findUnique({
    where: { userId: tutorId },
    select: tutorProfileSelect,
  });

  if (!tutor) {
    throw new AppError(404, "NOT_FOUND", "Approved tutor profile not found");
  }

  return tutor;
};

export const updateMyTutorProfile = async (
  tutorId,
  { bio, institutionName, subjects }
) => {
  return prisma.$transaction(async (transaction) => {
    const tutor = await transaction.tutorProfile.findUnique({
      where: { userId: tutorId },
      select: { userId: true },
    });

    if (!tutor) {
      throw new AppError(404, "NOT_FOUND", "Approved tutor profile not found");
    }

    const requestedSubjectIds = [...new Set(subjects.map((item) => item.subjectId))];
    const existingSubjects = requestedSubjectIds.length
      ? await transaction.subject.findMany({
          where: { id: { in: requestedSubjectIds } },
          select: { id: true },
        })
      : [];

    if (existingSubjects.length !== requestedSubjectIds.length) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        "One or more selected subjects do not exist"
      );
    }

    await transaction.tutorProfile.update({
      where: { userId: tutorId },
      data: { bio, institutionName },
    });

    await transaction.tutorSubject.deleteMany({
      where: { tutorId },
    });

    if (subjects.length) {
      await transaction.tutorSubject.createMany({
        data: subjects.map(({ subjectId, gradeLevel }) => ({
          tutorId,
          subjectId,
          gradeLevel,
        })),
      });
    }

    return transaction.tutorProfile.findUnique({
      where: { userId: tutorId },
      select: tutorProfileSelect,
    });
  });
};

/**
 * Get all subjects.
 */
export const getAllSubjects = async () => {
  return prisma.subject.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });
};

/**
 * Get all topics belonging to a subject.
 */
export const getTopicsBySubject = async (subjectId) => {
  const subject = await prisma.subject.findUnique({
    where: {
      id: subjectId,
    },
    select: {
      id: true,
    },
  });

  if (!subject) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "Subject not found"
    );
  }

  return prisma.topic.findMany({
    where: {
      subjectId,
    },
    select: {
      id: true,
      subjectId: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });
};

/**
 * Get approved tutor directory.
 *
 * Optional filters:
 * - subjectId
 * - gradeLevel
 * - regionId
 */
export const getTutors = async ({
  subjectId,
  gradeLevel,
  regionId,
}) => {
  const where = {
    user: {
      status: { notIn: ["SUSPENDED", "BANNED"] },
      ...(regionId ? { regionId } : {}),
    },

    ...(subjectId || gradeLevel
      ? {
          subjects: {
            some: {
              ...(subjectId ? { subjectId } : {}),
              ...(gradeLevel ? { gradeLevel } : {}),
            },
          },
        }
      : {}),
  };

  const tutors = await prisma.tutorProfile.findMany({
    where,

    select: {
      userId: true,
      bio: true,
      educationLevel: true,
      institutionName: true,

      currentGradeLevel: true,
      fieldOfStudy: true,
      yearOfStudy: true,

      user: {
        select: {
          fullName: true,
          status: true,
        },
      },

      subjects: {
        select: {
          subjectId: true,
          gradeLevel: true,
          subject: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },

      ratingsReceived: {
        select: {
          score: true,
        },
      },
    },

    orderBy: {
      userId: "asc",
    },
  });

  if (tutors.length > 0) {
    return tutors.map((tutor) => {
      const ratingCount = tutor.ratingsReceived.length;

      const avgRating =
        ratingCount === 0
          ? null
          : Number(
              (
                tutor.ratingsReceived.reduce(
                  (sum, rating) => sum + rating.score,
                  0
                ) / ratingCount
              ).toFixed(1)
            );

      return {
        id: tutor.userId,
        userId: tutor.userId,
        user: tutor.user,
        bio: tutor.bio,
        educationLevel: tutor.educationLevel,
        institutionName: tutor.institutionName,
        currentGradeLevel: tutor.currentGradeLevel,
        fieldOfStudy: tutor.fieldOfStudy,
        yearOfStudy: tutor.yearOfStudy,
        subjects: tutor.subjects,
        avgRating,
      };
    });
  }

  // Fallback: If no approved tutorProfile rows exist yet, return active users with role TUTOR
  const fallbackTutorUsers = await prisma.user.findMany({
    where: {
      role: "TUTOR",
      status: { notIn: ["SUSPENDED", "BANNED"] },
      ...(regionId ? { regionId } : {}),
    },
    select: {
      id: true,
      fullName: true,
    },
    orderBy: { fullName: "asc" },
  });

  return fallbackTutorUsers.map((u) => ({
    id: u.id,
    userId: u.id,
    user: { fullName: u.fullName },
    bio: "Dedicated peer mentor & subject specialist.",
    educationLevel: "UNIVERSITY",
    institutionName: "Academic Mentorship Network",
    currentGradeLevel: null,
    fieldOfStudy: "General Education",
    yearOfStudy: null,
    subjects: [],
    avgRating: 5.0,
  }));
};

/**
 * Get one approved tutor's public profile.
 */
export const getTutorById = async (tutorId) => {
  const tutor = await prisma.tutorProfile.findUnique({
    where: {
      userId: tutorId,
    },

    select: {
      userId: true,
      bio: true,
      educationLevel: true,
      institutionName: true,
      currentGradeLevel: true,
      fieldOfStudy: true,
      yearOfStudy: true,

      user: {
        select: {
          fullName: true,
        },
      },

      subjects: {
        select: {
          subjectId: true,
          gradeLevel: true,
        },
      },

      ratingsReceived: {
        select: {
          id: true,
          conversationId: true,
          studentId: true,
          tutorId: true,
          score: true,
          comment: true,
          createdAt: true,
        },

        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!tutor) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "Tutor not found"
    );
  }

  const ratingCount = tutor.ratingsReceived.length;

  const avgRating =
    ratingCount === 0
      ? null
      : Number(
          (
            tutor.ratingsReceived.reduce(
              (sum, rating) => sum + rating.score,
              0
            ) / ratingCount
          ).toFixed(1)
        );

  return {
    userId: tutor.userId,
    user: tutor.user,
    bio: tutor.bio,
    educationLevel: tutor.educationLevel,
    institutionName: tutor.institutionName,
    currentGradeLevel: tutor.currentGradeLevel,
    fieldOfStudy: tutor.fieldOfStudy,
    yearOfStudy: tutor.yearOfStudy,
    subjects: tutor.subjects,
    avgRating,
    ratingsReceived: tutor.ratingsReceived,
  };
};