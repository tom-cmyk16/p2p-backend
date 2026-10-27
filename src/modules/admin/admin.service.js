import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";
import { existsSync } from "fs";
import { resolveTutorDocumentPath } from "../../config/localUploads.js";

export const getTutorApplications = async ({ status }) => {
  const applications = await prisma.tutorApplication.findMany({
    where: status ? { status } : {},
    select: {
      id: true,
      userId: true,
      educationLevel: true,
      institutionName: true,
      currentGradeLevel: true,
      fieldOfStudy: true,
      yearOfStudy: true,
      bio: true,
      status: true,
      rejectionReason: true,
      reviewedById: true,
      submittedAt: true,
      reviewedAt: true,

      applicant: {
        select: {
          fullName: true,
          phoneOrEmail: true,
        },
      },

      documents: {
        select: {
          id: true,
          applicationId: true,
          documentType: true,
          fileName: true,
          uploadedAt: true,
        },
      },
    },

    orderBy: {
      submittedAt: "desc",
    },
  });

  return applications.map((application) => ({
    ...application,
    documents: application.documents.map((document) => ({
      ...document,
      fileUrl: `/admin/tutor-applications/${application.id}/documents/${document.id}`,
    })),
  }));
};

export const approveTutorApplication = async ({ applicationId, adminId }) => {
  const result = await prisma.$transaction(async (tx) => {
    const application = await tx.tutorApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        userId: true,
        educationLevel: true,
        institutionName: true,
        currentGradeLevel: true,
        fieldOfStudy: true,
        yearOfStudy: true,
        bio: true,
        status: true,
        documents: { select: { documentType: true, fileUrl: true } },
      },
    });

    if (!application) {
      throw new AppError(404, "NOT_FOUND", "Tutor application not found");
    }

    if (!["SUBMITTED", "UNDER_REVIEW"].includes(application.status)) {
      throw new AppError(
        409,
        "CONFLICT",
        `Tutor application has already been ${application.status.toLowerCase()}`
      );
    }

    const requiredDocumentTypes =
      application.educationLevel === "HIGH_SCHOOL"
        ? ["STUDENT_ID_CARD", "CERTIFICATE"]
        : ["STUDENT_ID_CARD", "TRANSCRIPT", "CERTIFICATE"];
    const hasRequiredDocument = application.documents.some((document) => {
      const filePath = resolveTutorDocumentPath(document.fileUrl);
      return requiredDocumentTypes.includes(document.documentType) &&
        filePath &&
        existsSync(filePath);
    });

    if (!hasRequiredDocument) {
      throw new AppError(
        422,
        "CREDENTIALS_REQUIRED",
        application.educationLevel === "HIGH_SCHOOL"
          ? "Upload an official school report card or school student ID before approval"
          : "Upload a university ID, official transcript, or degree/GC document before approval"
      );
    }

    const stateChange = await tx.tutorApplication.updateMany({
      where: {
        id: application.id,
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
      },
      data: {
        status: "APPROVED",
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
    });

    if (stateChange.count !== 1) {
      throw new AppError(
        409,
        "CONFLICT",
        "Tutor application has already been reviewed"
      );
    }

    const tutorProfile = await tx.tutorProfile.create({
      data: {
        userId: application.userId,
        approvedApplicationId: application.id,
        bio: application.bio,
        educationLevel: application.educationLevel,
        institutionName: application.institutionName,
        currentGradeLevel: application.currentGradeLevel,
        fieldOfStudy: application.fieldOfStudy,
        yearOfStudy: application.yearOfStudy,
        approvedById: adminId,
      },
      select: {
        userId: true,
        approvedApplicationId: true,
        bio: true,
        educationLevel: true,
        institutionName: true,
        currentGradeLevel: true,
        fieldOfStudy: true,
        yearOfStudy: true,
        approvedById: true,
        approvedAt: true,
      },
    });

    const userStateChange = await tx.user.updateMany({
      where: {
        id: application.userId,
        role: "TUTOR",
        status: "PENDING",
      },
      data: {
        role: "TUTOR",
        status: "APPROVED",
      },
    });

    if (userStateChange.count !== 1) {
      throw new AppError(
        409,
        "CONFLICT",
        "Tutor account is no longer pending and cannot be approved"
      );
    }

    return tutorProfile;
  });

  return result;
};

export const rejectTutorApplication = async ({
  applicationId,
  adminId,
  rejectionReason,
}) => {
  const application = await prisma.tutorApplication.findUnique({
    where: {
      id: applicationId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!application) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "Tutor application not found"
    );
  }

  if (
    application.status === "APPROVED" ||
    application.status === "REJECTED"
  ) {
    throw new AppError(
      409,
      "CONFLICT",
      `Tutor application has already been ${application.status.toLowerCase()}`
    );
  }

  const updatedApplication = await prisma.$transaction(async (tx) => {
    const stateChange = await tx.tutorApplication.updateMany({
      where: {
        id: applicationId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
      },
      data: {
        status: "REJECTED",
        rejectionReason,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });

    if (stateChange.count !== 1) {
      throw new AppError(
        409,
        "CONFLICT",
        "Tutor application has already been reviewed"
      );
    }

    return tx.tutorApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        userId: true,
        educationLevel: true,
        institutionName: true,
        currentGradeLevel: true,
        fieldOfStudy: true,
        yearOfStudy: true,
        bio: true,
        status: true,
        rejectionReason: true,
        reviewedById: true,
        submittedAt: true,
        reviewedAt: true,
        applicant: {
          select: {
            fullName: true,
            phoneOrEmail: true,
          },
        },
        documents: {
          select: {
            id: true,
            applicationId: true,
            documentType: true,
            fileName: true,
            uploadedAt: true,
          },
        },
      },
    });
  });

  return updatedApplication;
};

const reportSelect = {
  id: true,
  reporterId: true,
  targetType: true,
  reportedMessageId: true,
  reportedConversationId: true,
  reportedUserId: true,
  reason: true,
  status: true,
  reviewedById: true,
  createdAt: true,
  resolvedAt: true,

  reporter: {
    select: {
      id: true,
      fullName: true,
      phoneOrEmail: true,
    },
  },

  reportedMessage: {
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      type: true,
      textContent: true,
      fileUrl: true,
      fileName: true,
      status: true,
      isDeleted: true,
      sentAt: true,
    },
  },

  reportedConversation: {
    select: {
      id: true,
      studentId: true,
      tutorId: true,
      status: true,
      createdAt: true,
    },
  },

  reportedUser: {
    select: {
      id: true,
      fullName: true,
      phoneOrEmail: true,
      role: true,
      status: true,
    },
  },
};

export const getReports = async ({ status }) => {
  const reports = await prisma.report.findMany({
    where: status ? { status } : {},
    select: reportSelect,
    orderBy: {
      createdAt: "desc",
    },
  });

  return reports;
};

export const getAdminDashboardOverview = async () => {
  const [
    activeStudents,
    tutors,
    tutorApplications,
    reports,
    gradeDistribution,
    recentTransactions,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "STUDENT", status: "APPROVED" } }),
    prisma.user.count({ where: { role: "TUTOR", status: "APPROVED" } }),
    prisma.tutorApplication.count({
      where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
    }),
    prisma.report.count({ where: { status: "PENDING" } }),
    prisma.studentProfile.groupBy({
      by: ["gradeLevel"],
      where: {
        user: { is: { role: "STUDENT", status: "APPROVED" } },
      },
      _count: { userId: true },
    }),
    prisma.payment.findMany({
      select: {
        id: true,
        txRef: true,
        amountMinor: true,
        currency: true,
        status: true,
        createdAt: true,
        student: { select: { fullName: true } },
        tutor: { select: { user: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const tutorAccounts = await prisma.user.findMany({
    where: { role: "TUTOR" },
    select: {
      id: true,
      fullName: true,
      phoneOrEmail: true,
      status: true,
      createdAt: true,
      tutorProfile: {
        select: {
          educationLevel: true,
          institutionName: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    metrics: {
      activeStudents,
      tutors,
      tutorApplications,
      reports,
    },
    gradeDistribution: gradeDistribution.map(({ gradeLevel, _count }) => ({
      gradeLevel,
      students: _count.userId,
    })),
    recentTransactions,
    tutors: tutorAccounts,
  };
};

export const updateReport = async ({
  reportId,
  adminId,
  status,
}) => {
  const report = await prisma.report.findUnique({
    where: {
      id: reportId,
    },
    select: {
      id: true,
    },
  });

  if (!report) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "Report not found"
    );
  }

  const resolvedAt =
    status === "REVIEWED" ||
    status === "ACTION_TAKEN" ||
    status === "DISMISSED"
      ? new Date()
      : null;

  const updatedReport = await prisma.report.update({
    where: {
      id: reportId,
    },
    data: {
      status,
      reviewedById: adminId,
      resolvedAt,
    },
    select: reportSelect,
  });

  return updatedReport;
};

export const updateUserStatus = async ({
  userId,
  status,
}) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
    },
  });

  if (!user) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "User not found"
    );
  }

  const updatedUser = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      status,
    },
    select: {
      id: true,
      fullName: true,
      phoneOrEmail: true,
      role: true,
      status: true,
      regionId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return updatedUser;
};

export const listUsers = async ({ role, status, search }) => {
  const where = {};

  // Filter out ADMIN users so only regular users (non-admins) appear in user management
  if (role && role !== "ALL") {
    if (role === "ADMIN") {
      where.role = { not: "ADMIN", in: [] };
    } else {
      where.role = role;
    }
  } else {
    where.role = { not: "ADMIN" };
  }

  if (status) {
    where.status = status;
  }
  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { phoneOrEmail: { contains: q, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      phoneOrEmail: true,
      role: true,
      status: true,
      regionId: true,
      profileImageUrl: true,
      createdAt: true,
      updatedAt: true,
      tutorProfile: {
        select: {
          bio: true,
          educationLevel: true,
          institutionName: true,
          currentGradeLevel: true,
          fieldOfStudy: true,
          yearOfStudy: true,
          approvedAt: true,
          approvedBy: { select: { fullName: true } },
          subjects: {
            select: {
              gradeLevel: true,
              subject: { select: { id: true, name: true } },
            },
          },
          _count: {
            select: {
              mentorshipSessions: true,
              packageEnrollments: true,
            },
          },
        },
      },
      studentProfile: {
        select: {
          gradeLevel: true,
          _count: {
            select: {
              packageEnrollments: true,
              mentorshipSessions: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return users;
};

export const verifyTutorByCall = async ({ userId, adminId }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tutorProfile: true },
  });
  if (!user) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }
  if (user.role !== "TUTOR") {
    throw new AppError(400, "BAD_REQUEST", "Only tutor accounts can be verified for assignment");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      status: "APPROVED",
    },
    select: {
      id: true,
      fullName: true,
      phoneOrEmail: true,
      role: true,
      status: true,
      updatedAt: true,
    },
  });

  if (user.tutorProfile) {
    await prisma.tutorProfile.update({
      where: { userId },
      data: {
        approvedById: adminId,
        approvedAt: new Date(),
      },
    });
  }

  return updated;
};

export const getReportById = async ({ reportId }) => {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: {
      ...reportSelect,
      reporter: {
        select: {
          id: true,
          fullName: true,
          phoneOrEmail: true,
          studentProfile: {
            select: {
              gradeLevel: true,
              packageEnrollments: {
                where: { accessExpiresAt: { gt: new Date() } },
                select: {
                  id: true,
                  courseId: true,
                  gradeLevel: true,
                  packageType: true,
                  assignedTutorId: true,
                  mentorshipExpiresAt: true,
                  course: {
                    select: {
                      id: true,
                      subject: { select: { id: true, name: true } },
                      gradeLevel: true,
                    },
                  },
                  assignedTutor: {
                    select: {
                      userId: true,
                      user: { select: { fullName: true, phoneOrEmail: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!report) {
    throw new AppError(404, "NOT_FOUND", "Report not found");
  }

  return report;
};

export const getReplacementTutorsForReport = async ({ reportId }) => {
  const report = await getReportById({ reportId });
  const offendingTutorId = report.reportedUserId || report.reportedConversation?.tutorId;

  const studentEnrollments = report.reporter?.studentProfile?.packageEnrollments || [];
  const targetEnrollment =
    studentEnrollments.find((e) => e.assignedTutorId === offendingTutorId) ||
    studentEnrollments[0];

  const course = targetEnrollment?.course;
  const gradeLevel = targetEnrollment?.gradeLevel || course?.gradeLevel;

  const subjectWhere = course?.subject?.id
    ? { subjectId: course.subject.id, gradeLevel }
    : gradeLevel
    ? { gradeLevel }
    : {};

  const tutors = await prisma.tutorProfile.findMany({
    where: {
      userId: { not: offendingTutorId || "" },
      user: { is: { status: "APPROVED" } },
      ...(Object.keys(subjectWhere).length > 0 ? { subjects: { some: subjectWhere } } : {}),
    },
    select: {
      userId: true,
      bio: true,
      educationLevel: true,
      institutionName: true,
      fieldOfStudy: true,
      yearOfStudy: true,
      user: {
        select: {
          fullName: true,
          phoneOrEmail: true,
          profileImageUrl: true,
        },
      },
      subjects: {
        where: Object.keys(subjectWhere).length > 0 ? subjectWhere : undefined,
        select: {
          gradeLevel: true,
          subject: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { user: { fullName: "asc" } },
  });

  return {
    targetEnrollment,
    offendingTutorId,
    tutors,
  };
};

export const reassignTutorForReport = async ({ reportId, adminId, newTutorId }) => {
  const report = await getReportById({ reportId });
  const studentId = report.reporterId;
  const offendingTutorId = report.reportedUserId || report.reportedConversation?.tutorId;

  const [student, newTutor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId },
      include: {
        studentProfile: {
          include: {
            packageEnrollments: {
              where: { accessExpiresAt: { gt: new Date() } },
            },
          },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: newTutorId },
      include: { tutorProfile: true },
    }),
  ]);

  if (!student || !student.studentProfile) {
    throw new AppError(404, "NOT_FOUND", "Student or student profile not found");
  }
  if (!newTutor || newTutor.role !== "TUTOR" || newTutor.status !== "APPROVED") {
    throw new AppError(400, "BAD_REQUEST", "Selected replacement tutor is not an approved tutor");
  }

  const enrollments = student.studentProfile.packageEnrollments;
  const enrollmentToUpdate =
    enrollments.find((e) => e.assignedTutorId === offendingTutorId) || enrollments[0];

  if (!enrollmentToUpdate) {
    throw new AppError(404, "NOT_FOUND", "No active enrollment found for this student to reassign");
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.packageEnrollment.update({
      where: { id: enrollmentToUpdate.id },
      data: { assignedTutorId: newTutorId },
    });

    if (offendingTutorId) {
      await tx.mentorshipSession.updateMany({
        where: {
          enrollmentId: enrollmentToUpdate.id,
          tutorId: offendingTutorId,
          status: "SCHEDULED",
        },
        data: { status: "CANCELLED" },
      });
    }

    const updatedReport = await tx.report.update({
      where: { id: reportId },
      data: {
        status: "ACTION_TAKEN",
        reviewedById: adminId,
        resolvedAt: new Date(),
      },
      select: reportSelect,
    });

    return updatedReport;
  });

  return {
    success: true,
    report: result,
    reassignedTo: {
      id: newTutor.id,
      fullName: newTutor.fullName,
      phoneOrEmail: newTutor.phoneOrEmail,
    },
  };
};