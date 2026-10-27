import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validate, validateQuery,validateParams } from "../../middlewares/validate.middleware.js";
import { uploadTutorDocument } from "../../middlewares/upload.middleware.js";
import {listConversationMessages,createTextMessage,createFileMessage,} from "./messages.controller.js";
import {conversationIdParamSchema,messagePaginationQuerySchema,sendTextMessageSchema,} from "./messages.validation.js";
import { assertActiveConversationMentorship } from "./messages.service.js";


const router = Router();

const requireActiveMentorship = async (req, res, next) => {
  try {
    await assertActiveConversationMentorship({
      conversationId: req.params.conversationId,
      userId: req.user.id,
    });
    return next();
  } catch (error) {
    return next(error);
  }
};

router.get("/:conversationId/messages",authenticate,
  validateParams(conversationIdParamSchema),
  validateQuery(messagePaginationQuerySchema),
  listConversationMessages
);

router.post("/:conversationId/messages",authenticate,
  validateParams(conversationIdParamSchema),
  validate(sendTextMessageSchema),
  createTextMessage
);

router.post("/:conversationId/messages/file",authenticate,
  validateParams(conversationIdParamSchema),
  requireActiveMentorship,
  uploadTutorDocument,
  createFileMessage
);

export default router;