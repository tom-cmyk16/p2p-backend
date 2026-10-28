import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

let prisma;

try {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ CRITICAL ERROR: DATABASE_URL is missing in environment variables!");
  }

  const adapter = new PrismaPg({ connectionString });
  prisma = new PrismaClient({ adapter });
  console.log("✅ Database connected successfully!");
} catch (error) {
  console.error("❌ Failed to initialize Prisma Client:", error.message);
}

export { prisma };
