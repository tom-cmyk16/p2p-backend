import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ DATABASE_URL is missing in environment variables!");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });
