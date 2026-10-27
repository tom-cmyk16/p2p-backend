import {
  createTutorApplication,
  getTutorQualificationDocument,
  getMyTutorApplication,
  uploadTutorQualificationDocument,
} from "./tutorApplications.service.js";
import { removeUploadedFile } from "../../config/localUploads.js";
import {
  createTutorApplicationSchema,
  uploadTutorDocumentSchema,
} from "./tutorApplications.validation.js";


export const createApplication = async (req, res, next) => {
  try {
    const applicationValidation = createTutorApplicationSchema.safeParse(req.body);
    const documentValidation = uploadTutorDocumentSchema.safeParse(req.body);

    if (!applicationValidation.success || !documentValidation.success || !req.file) {
      await removeUploadedFile(req.file);
      const validationError =
        applicationValidation.error?.issues[0] ||
        documentValidation.error?.issues[0];
      return res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: validationError?.message || "A qualification document is required",
          ...(validationError && {
            details: [{
              field: validationError.path.join("."),
              message: validationError.message,
            }],
          }),
        },
      });
    }

    const result = await createTutorApplication({
      userId: req.user.id,
      ...applicationValidation.data,
      documentType: documentValidation.data.documentType,
      file: req.file,
    });
    return res.status(201).json(result);
  } catch (error) {
    if (req.file) {
      try {
        await removeUploadedFile(req.file);
      } catch (cleanupError) {
        return next(cleanupError);
      }
    }
    next(error);
  }
};

export const getMyApplication = async ( req, res, next) => {
  try {
    const result = await getMyTutorApplication(
      req.user.id
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const uploadDocument = async (req, res, next) => {
  try {
    const validation = uploadTutorDocumentSchema.safeParse(req.body);
    if (!validation.success) {
      await removeUploadedFile(req.file);
      return res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: validation.error.issues[0]?.message || "Invalid document type",
        },
      });
    }

    if (!req.file) {
      return res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "A document file is required",
        },
      });
    }

    const result = await uploadTutorQualificationDocument({
      userId: req.user.id,
      applicationId: req.params.id,
      documentType: validation.data.documentType,
      file: req.file,
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error("Tutor application document upload failed:", error);
    if (req.file) {
      try {
        await removeUploadedFile(req.file);
      } catch (cleanupError) {
        console.error("Failed to remove tutor application upload:", cleanupError);
      }
    }
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: {
        code: error.code || "INTERNAL_ERROR",
        message: statusCode === 500
          ? "Unable to upload the tutor application document"
          : error.message,
        ...(error.details && { details: error.details }),
      },
    });
  }
};

export const getDocument = async (req, res, next) => {
  try {
    const document = await getTutorQualificationDocument({
      userId: req.user.id,
      applicationId: req.params.id,
      documentId: req.params.documentId,
      isAdmin: req.user.role === "ADMIN",
    });
    const contentType = {
      ".pdf": "application/pdf",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
    }[document.extension];

    if (!contentType) {
      return res.status(415).json({
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "This tutor document format cannot be previewed",
        },
      });
    }

    return res
      .type(contentType)
      .set("Content-Disposition", `inline; filename="${document.fileName.replace(/[^\w.\- ]/g, "_")}"`)
      .set("X-Content-Type-Options", "nosniff")
      .set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'self'")
      .set("Cache-Control", "private, no-store")
      .sendFile(document.path, (error) => {
        if (error) next(error);
      });
  } catch (error) {
    next(error);
  }
};