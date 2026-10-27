import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/requireRole.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {listMyConversations,createConversation,} from "./conversations.controller.js";
import {createConversationSchema,} from "./conversations.validation.js";



const router = Router();

// GET /api/v1/conversations
// Auth: any authenticated user
router.get("/",authenticate,
  listMyConversations
);

// POST /api/v1/conversations
// Auth: STUDENT only
router.post("/", authenticate, requireRole("STUDENT"),
  validate(createConversationSchema),
  createConversation
);

export default router;