import fs from "fs";
import { unlink } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

export const uploadDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../uploads"
);
export const privateUploadDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../private_uploads"
);

for (const directory of [uploadDir, privateUploadDir]) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

export const getPublicUploadPath = (filename) => `/uploads/${filename}`;

export const removeUploadedFile = async (file) => {
  if (file?.path) {
    await unlink(file.path);
  }
};

export const removeStoredUpload = async (publicPath) => {
  if (!publicPath?.startsWith("/uploads/")) {
    return;
  }

  const filename = path.basename(publicPath);
  if (filename) {
    await unlink(path.join(uploadDir, filename));
  }
};

export const resolveTutorDocumentPath = (storedPath) => {
  if (storedPath?.startsWith("/uploads/")) {
    return path.join(uploadDir, path.basename(storedPath));
  }

  if (!storedPath || path.basename(storedPath) !== storedPath) {
    return null;
  }

  return path.join(privateUploadDir, storedPath);
};
