import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");

dotenv.config({ path: envPath });
dotenv.config();

import app from "./app.js";
import { prisma } from "./config/db.js";
import { initializeSocket } from "./socket/index.js";

const PORT = process.env.PORT || 3000;

const httpServer = http.createServer(app);

const io = initializeSocket(httpServer);

app.set("io", io);

async function startServer() {
  try {
    await prisma.$connect();
    console.log("PostgreSQL connected");

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "content_access_days" INTEGER NOT NULL DEFAULT 30;
      ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "mentorship_duration_days" INTEGER NOT NULL DEFAULT 7;
      ALTER TABLE "package_enrollments" ADD COLUMN IF NOT EXISTS "content_access_days" INTEGER NOT NULL DEFAULT 30;
      ALTER TABLE "package_enrollments" ADD COLUMN IF NOT EXISTS "mentorship_duration_days" INTEGER NOT NULL DEFAULT 7;
    `);
    console.log("Database schema synchronized: courses and package_enrollments columns verified");

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
}

startServer();