import bcrypt from "bcrypt";
import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";
import {
  getPublicUploadPath,
  removeStoredUpload,
  removeUploadedFile,
} from "../../config/localUploads.js";

const userProfileSelect = {
  id: true,
  fullName: true,
  phoneOrEmail: true,
  role: true,
  status: true,
  profileImageUrl: true,
  createdAt: true,
  updatedAt: true,

  region: {
    select: {
      id: true,
      name: true,
    },
  },

  studentProfile: {
    select: {
      userId: true,
      gradeLevel: true,
    },
  },

  tutorProfile: {
    select: {
      userId: true,
      bio: true,
      educationLevel: true,
      institutionName: true,
      currentGradeLevel: true,
      fieldOfStudy: true,
      yearOfStudy: true,
      approvedApplicationId: true,
    },
  },
};

export const getMyProfile = async (userId) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: userProfileSelect,
    });

    if (!user) {
      throw new AppError(
        404,
        "NOT_FOUND",
        "User not found"
      );
    }

    return user;
  } catch (error) {
    console.error("[users.service.getMyProfile] Failed to fetch profile for userId:", userId, error);
    throw error;
  }
};

export const updateMyProfile = async (userId, data) => {
  if (data.regionId) {
    const region = await prisma.region.findUnique({
      where: {
        id: data.regionId,
      },
    });

    if (!region) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        "Region not found"
      );
    }
  }

  const user = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      ...(data.fullName !== undefined && {
        fullName: data.fullName,
      }),

      ...(data.regionId !== undefined && {
        regionId: data.regionId,
      }),
    },
    select: userProfileSelect,
  });

  return user;
};

export const changeMyPassword = async (userId, { currentPassword, newPassword }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }

  const passwordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(400, "VALIDATION_ERROR", "Current password is incorrect", [
      { field: "currentPassword", message: "Current password is incorrect" },
    ]);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  return { message: "Password changed successfully" };
};

export const updateMyProfileImage = async (userId, file) => {
  if (!file?.filename) {
    throw new AppError(422, "VALIDATION_ERROR", "A profile image is required");
  }

  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { profileImageUrl: true },
    });

    if (!currentUser) {
      throw new AppError(404, "NOT_FOUND", "User not found");
    }

    const profileImageUrl = getPublicUploadPath(file.filename);
    const user = await prisma.user.update({
      where: { id: userId },
      data: { profileImageUrl },
      select: userProfileSelect,
    });

    if (currentUser.profileImageUrl) {
      try {
        await removeStoredUpload(currentUser.profileImageUrl);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error("Failed to remove previous profile image:", error);
        }
      }
    }

    return user;
  } catch (error) {
    try {
      await removeUploadedFile(file);
    } catch (cleanupError) {
      console.error("Failed to remove profile image after profile update failed:", cleanupError);
    }
    throw error;
  }
};