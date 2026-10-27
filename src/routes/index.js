import express from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import tutorApplicationRoutes from "../modules/tutorApplications/tutorApplications.routes.js";
import tutorsRoutes from "../modules/tutors/tutors.routes.js";
import userRoutes from "../modules/users/users.routes.js";
import quizRoutes from "../modules/quiz/quiz.routes.js";
import conversationsRoutes from "../modules/conversations/conversations.routes.js";
import messagesRoutes from "../modules/messages/messages.routes.js";
import adminRoutes from "../modules/admin/admin.routes.js";
import ratingsRoutes from "../modules/ratings/ratings.routes.js";
import reportsRoutes from "../modules/reports/reports.routes.js";
import learningRoutes from "../modules/learning/learning.routes.js";
import schedulingRoutes from "../modules/scheduling/scheduling.routes.js";
import paymentRoutes from "../modules/payments/payments.routes.js";
import revenueRoutes from "../modules/payments/revenue.routes.js";



const router = express.Router();

router.use("/auth", authRoutes);
router.use("/tutor-applications",tutorApplicationRoutes);
router.use("/", tutorsRoutes);
router.use("/users", userRoutes);
router.use("/quiz", quizRoutes);
router.use("/conversations", conversationsRoutes);
router.use("/conversations", messagesRoutes);
router.use("/conversations", ratingsRoutes);
router.use("/reports", reportsRoutes);
router.use("/admin", adminRoutes);
router.use("/learning", learningRoutes);
router.use("/scheduling", schedulingRoutes);
router.use("/payments", paymentRoutes);
router.use("/admin/revenue", revenueRoutes);


export default router;