import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";
import { uploadDir } from "./config/localUploads.js";
import { prisma } from "./config/db.js";
import path from "path";

const app = express();
app.set("trust proxy", 1);
const allowedOrigins = (
  process.env.FRONTEND_URL ||
  "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({
  limit: "3mb",
  verify: (req, res, buffer) => {
    if (
      req.originalUrl.startsWith("/api/v1/payments/webhook") ||
      req.originalUrl.startsWith("/api/v1/payments/callback")
    ) {
      req.rawBody = Buffer.from(buffer);
    }
  },
}));
app.use("/uploads", async (req, res, next) => {
  try {
    const publicPath = `/uploads/${path.basename(req.path)}`;
    const isTutorDocument = await prisma.tutorQualificationDocument.findFirst({
      where: { fileUrl: publicPath },
      select: { id: true },
    });

    if (isTutorDocument) {
      return res.sendStatus(404);
    }

    return next();
  } catch (error) {
    return next(error);
  }
});
app.use("/uploads", express.static(uploadDir));
app.use("/api/v1", routes);
app.use("/api", routes);
app.get("/", (req, res) => {
  res.send("P2P Exam Preparation API is running");
});
app.use(errorHandler);

export default app;
