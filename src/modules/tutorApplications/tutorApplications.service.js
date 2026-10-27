import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";
import { resolveTutorDocumentPath } from "../../config/localUploads.js";
import { existsSync } from "fs";
import path from "path";

export const createTutorApplication = async ({
  userId,
  educationLevel,
  institutionName,
  currentGradeLevel,
  fieldOfStudy,
  yearOfStudy,
  bio,
  documentType,
  file,
}) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });

  if (!user || user.status !== "PENDING") {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only pending tutor accounts can submit a verification application"
    );
  }

  if (!file?.filename || file.size === 0) {
    throw new AppError(422, "VALIDATION_ERROR", "A qualification document is required");
  }

  const acceptedDocumentTypes =
    educationLevel === "HIGH_SCHOOL"
      ? ["STUDENT_ID_CARD", "CERTIFICATE"]
      : ["STUDENT_ID_CARD", "TRANSCRIPT", "CERTIFICATE"];

  if (!acceptedDocumentTypes.includes(documentType)) {
    throw new AppError(
      422,
      "CREDENTIALS_REQUIRED",
      educationLevel === "HIGH_SCHOOL"
        ? "Upload a school student ID or official school report card"
        : "Upload a university ID, official transcript, or degree/GC certificate"
    );
  }

  const existingApplication =
    await prisma.tutorApplication.findFirst({
      where: {
        userId,
        status: {
          in: ["SUBMITTED", "UNDER_REVIEW"],
        },
      },
    });

  if (existingApplication) {
    throw new AppError(
      409,
      "CONFLICT",
      "You already have a tutor application under review"
    );
  }

  return prisma.$transaction(async (tx) => {
    const application = await tx.tutorApplication.create({
      data: {
        userId,
        educationLevel,
        institutionName,
        currentGradeLevel,
        fieldOfStudy,
        yearOfStudy,
        bio,
      },
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
        submittedAt: true,
      },
    });

    const document = await tx.tutorQualificationDocument.create({
      data: {
        applicationId: application.id,
        documentType,
        fileUrl: file.filename,
        fileName: file.originalname,
      },
      select: {
        id: true,
        applicationId: true,
        documentType: true,
        fileName: true,
        uploadedAt: true,
      },
    });

    return {
      ...application,
      documents: [{
        ...document,
        fileUrl: `/tutor-applications/${application.id}/documents/${document.id}`,
      }],
    };
  });
};

export const getMyTutorApplication = async (userId) => {
  const application =
    await prisma.tutorApplication.findFirst({
      where: {
        userId,
      },
      orderBy: {
        submittedAt: "desc",
      },
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

  if (!application) {
    return null;
  }

  return {
    ...application,
    documents: application.documents.map((document) => ({
      ...document,
      fileUrl: `/tutor-applications/${application.id}/documents/${document.id}`,
    })),
  };
};

export const uploadTutorQualificationDocument = async ({
  userId,
  applicationId,
  documentType,
  file,
}) => {
  if (!file) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "A document file is required",
      [
        {
          field: "file",
          message: "Please upload a file",
        },
      ]
    );
  }

  const application = await prisma.tutorApplication.findUnique({
    where: {
      id: applicationId,
    },
    select: {
      id: true,
      userId: true,
      status: true,
      educationLevel: true,
    },
  });

  if (!application) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "Tutor application not found"
    );
  }

  if (application.userId !== userId) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "You are not allowed to upload documents to this application"
    );
  }

  if (!["SUBMITTED", "UNDER_REVIEW"].includes(application.status)) {
    throw new AppError(
      409,
      "CONFLICT",
      "Documents cannot be changed after an application has been reviewed"
    );
  }

  if (
    application.educationLevel === "HIGH_SCHOOL" &&
    documentType === "TRANSCRIPT"
  ) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "High-school tutor credentials must be a school ID or official report card"
    );
  }

  if (!file.filename || file.size === 0) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "The uploaded document is empty",
      [{ field: "file", message: "Please select a non-empty file" }]
    );
  }

  const document = await prisma.tutorQualificationDocument.create({
    data: {
      applicationId,
      documentType,
      fileUrl: file.filename,
      fileName: file.originalname,
    },
    select: {
      id: true,
      applicationId: true,
      documentType: true,
      fileUrl: true,
      fileName: true,
      uploadedAt: true,
    },
  });

  return {
    ...document,
    fileUrl: `/tutor-applications/${applicationId}/documents/${document.id}`,
  };
};

export const getTutorQualificationDocument = async ({
  userId,
  applicationId,
  documentId,
  isAdmin = false,
}) => {
  const document = await prisma.tutorQualificationDocument.findFirst({
    where: {
      id: documentId,
      applicationId,
    },
    select: {
      id: true,
      applicationId: true,
      fileUrl: true,
      fileName: true,
      application: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!document) {
    throw new AppError(404, "NOT_FOUND", "Tutor document not found");
  }

  if (!isAdmin && document.application.userId !== userId) {
    throw new AppError(403, "FORBIDDEN", "You cannot access this tutor document");
  }

  const filePath = resolveTutorDocumentPath(document.fileUrl);
  if (!filePath || !existsSync(filePath)) {
    throw new AppError(404, "NOT_FOUND", "Tutor document file not found");
  }

  return {
    path: filePath,
    fileName: path.basename(document.fileName),
    extension: path.extname(filePath).toLowerCase(),
  };
};