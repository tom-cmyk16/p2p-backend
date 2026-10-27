import bcrypt from "bcrypt";
import { prisma } from "../src/config/db.js";

const ADMIN_EMAIL = "admin@p2pexam.local";
const ADMIN_PASSWORD = "Admin@12345";

const createAdmin = async () => {
  try {
    const existingAdmin = await prisma.user.findUnique({
      where: {
        phoneOrEmail: ADMIN_EMAIL,
      },
    });

    if (existingAdmin) {
      console.log("Admin already exists:");
      console.log(existingAdmin);
      return;
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const admin = await prisma.user.create({
      data: {
        fullName: "System Administrator",
        phoneOrEmail: ADMIN_EMAIL,
        passwordHash,
        role: "ADMIN",
        status: "APPROVED",
      },
      select: {
        id: true,
        fullName: true,
        phoneOrEmail: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    console.log("Admin created successfully:");
    console.log(admin);
    console.log("\nAdmin credentials:");
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
  } catch (error) {
    console.error("Failed to create admin:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

createAdmin();