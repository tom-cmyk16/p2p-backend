import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import multer from "multer";
import { AppError } from "../utils/ApiError.js";
import {
  privateUploadDir,
  removeUploadedFile,
  uploadDir,
} from "../config/localUploads.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];

const imageMimeTypes = ["image/jpeg", "image/png"];

const createStorage = (directory) => multer.diskStorage({
  destination: (req, file, cb) => cb(null, directory),
  filename: (req, file, cb) => {
    const extension = file.mimetype === "application/pdf"
      ? ".pdf"
      : file.mimetype === "image/png"
        ? ".png"
        : ".jpg";
    cb(null, `${randomUUID()}${extension}`);
  },
});

const createUploadParser = (allowedTypes, directory) => multer({
  storage: createStorage(directory),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new AppError(
        422,
        "VALIDATION_ERROR",
        allowedTypes.length === 2
          ? "Only JPG and PNG images are allowed"
          : "Only JPG, PNG, and PDF files are allowed"
      ));
    }
    return cb(null, true);
  },
}).single("file");

const hasValidFileSignature = async (file) => {
  const bytes = await readFile(file.path);

  if (file.mimetype === "application/pdf") {
    return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  }

  if (file.mimetype === "image/png") {
    return bytes.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
  }

  if (file.mimetype === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  return false;
};

const runUpload = (parser) => (req, res, next) => {
  parser(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        const isFileTooLarge = error.code === "LIMIT_FILE_SIZE";
        return next(
          new AppError(
            isFileTooLarge ? 413 : 422,
            isFileTooLarge ? "FILE_TOO_LARGE" : "INVALID_FILE",
            isFileTooLarge
              ? "File size must not exceed 5 MB"
              : "The uploaded file is invalid"
          )
        );
      }

      return next(error);
    }

    const verifyFile = async () => {
      if (!req.file) {
        return next();
      }

      try {
        const validFile = await hasValidFileSignature(req.file);
        if (!validFile) {
          await removeUploadedFile(req.file);
          return next(new AppError(
            422,
            "INVALID_FILE",
            "File contents do not match the selected file type"
          ));
        }

        return next();
      } catch (errorDuringVerification) {
        try {
          await removeUploadedFile(req.file);
        } catch (cleanupError) {
          return next(cleanupError);
        }

        return next(errorDuringVerification);
      }
    };

    verifyFile().catch(next);
  });
};

export const uploadTutorDocument = runUpload(
  createUploadParser(allowedMimeTypes, uploadDir)
);
export const uploadTutorApplicationDocument = uploadTutorDocument;
export const uploadPrivateTutorApplicationDocument = runUpload(
  createUploadParser(allowedMimeTypes, privateUploadDir)
);
export const uploadProfileImage = runUpload(
  createUploadParser(imageMimeTypes, uploadDir)
);