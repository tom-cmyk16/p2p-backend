import bcrypt from "bcrypt";
import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";
import { generateToken } from "../../utils/jwt.js";

const publicUserSelect = {
  id: true,
  fullName: true,
  phoneOrEmail: true,
  role: true,
  status: true,
  regionId: true,
  createdAt: true,
  updatedAt: true,
};

export const registerUser = async ({
  fullName,
  phoneOrEmail,
  password,
  role = "STUDENT",
  gradeLevel,
  regionId,
}) => {
  const existingUser = await prisma.user.findUnique({
    where: {
      phoneOrEmail,
    },
  });

  if (existingUser) {
    throw new AppError(
      409,
      "CONFLICT",
      "An account with this phone or email already exists"
    );
  }

  if (regionId) {
    const region = await prisma.region.findUnique({
      where: {
        id: regionId,
      },
    });

    if (!region) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        "The specified region does not exist",
        [
          {
            field: "regionId",
            message: "Region not found",
          },
        ]
      );
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      fullName,
      phoneOrEmail,
      passwordHash,
      role,
      status: role === "TUTOR" ? "PENDING" : "APPROVED",

      ...(regionId && {
        regionId,
      }),

      ...(role === "STUDENT" && {
        studentProfile: {
          create: {
            gradeLevel,
          },
        },
      }),
    },

    select: publicUserSelect,
  });

  return { user };
};

export const loginUser = async ({
  phoneOrEmail,
  password,
}) => {
  const user = await prisma.user.findUnique({
    where: {
      phoneOrEmail,
    },
  });

  if (!user) {
    throw new AppError(
      401,
      "UNAUTHORIZED",
      "Invalid phone or email or password"
    );
  }

  if (
    user.status === "SUSPENDED" ||
    user.status === "BANNED"
  ) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "This account is suspended or banned"
    );
  }

  const passwordMatches = await bcrypt.compare(
    password,
    user.passwordHash
  );

  if (!passwordMatches) {
    throw new AppError(
      401,
      "UNAUTHORIZED",
      "Invalid phone or email or password"
    );
  }

  const safeUser = {
    id: user.id,
    fullName: user.fullName,
    phoneOrEmail: user.phoneOrEmail,
    role: user.role,
    status: user.status,
    regionId: user.regionId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  const token = generateToken(safeUser);

  return {
    user: safeUser,
    token,
  };
};

export const requestPasswordReset = async ({ phoneOrEmail }) => {
  const normalized = phoneOrEmail?.trim();
  if (!normalized) {
    throw new AppError(422, "VALIDATION_ERROR", "Email or phone number is required");
  }

  const user = await prisma.user.findFirst({
    where: {
      phoneOrEmail: { equals: normalized, mode: "insensitive" },
    },
  });

  if (!user) {
    return {
      message: "If an account with that email exists, password reset instructions have been sent.",
    };
  }

  const { default: jwt } = await import("jsonwebtoken");
  const { sendPasswordResetEmail } = await import("../../utils/emailService.js");

  const resetToken = jwt.sign(
    {
      userId: user.id,
      phoneOrEmail: user.phoneOrEmail,
      action: "PASSWORD_RESET",
    },
    process.env.JWT_SECRET || "fallback_secret_for_development",
    { expiresIn: "1h" }
  );

  const frontendBase = process.env.FRONTEND_URL || "http://localhost:5173";
  const resetUrl = `${frontendBase}/reset-password?token=${encodeURIComponent(resetToken)}`;

  await sendPasswordResetEmail({
    toEmail: user.phoneOrEmail,
    resetUrl,
    userName: user.fullName,
  });

  return {
    message: "If an account with that email exists, password reset instructions have been sent.",
    devResetUrl: process.env.NODE_ENV !== "production" ? resetUrl : undefined,
  };
};

export const resetPasswordWithToken = async ({ token, newPassword }) => {
  if (!token) {
    throw new AppError(422, "VALIDATION_ERROR", "Password reset token is required");
  }
  if (!newPassword || newPassword.length < 8) {
    throw new AppError(422, "VALIDATION_ERROR", "Password must be at least 8 characters");
  }

  const { default: jwt } = await import("jsonwebtoken");

  let decoded;
  try {
    decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_secret_for_development"
    );
  } catch (err) {
    throw new AppError(
      400,
      "INVALID_OR_EXPIRED_TOKEN",
      "The password reset link is invalid or has expired. Please request a new one."
    );
  }

  if (decoded.action !== "PASSWORD_RESET" || !decoded.userId) {
    throw new AppError(400, "INVALID_TOKEN", "Invalid reset token payload");
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
  });

  if (!user) {
    throw new AppError(404, "NOT_FOUND", "User account not found");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return {
    message: "Password has been successfully updated. You can now log in with your new password.",
  };
};