import express from "express";

import {
  changePassword,
  getMe,
  updateMe,
  updateProfileImage,
} from "./users.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { uploadProfileImage } from "../../middlewares/upload.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { changePasswordSchema, updateUserSchema } from "./users.validation.js";


const router = express.Router();

router.get("/me",authenticate,getMe);

router.patch("/me",authenticate,
  validate(updateUserSchema),
  updateMe
);

router.patch("/me/password", authenticate, validate(changePasswordSchema), changePassword);

router.post("/me/profile-image", authenticate, uploadProfileImage, updateProfileImage);

export default router;