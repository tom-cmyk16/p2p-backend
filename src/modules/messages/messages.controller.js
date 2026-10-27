import { removeUploadedFile } from "../../config/localUploads.js";
import {
  getConversationMessages,
  sendTextMessage,
  sendFileMessage,
} from "./messages.service.js";

export const listConversationMessages = async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 50);

    const result = await getConversationMessages({
      conversationId: req.params.conversationId,
      userId: req.user.id,
      page,
      limit,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const createTextMessage = async (req, res, next) => {
  try {
    const message = await sendTextMessage({
      conversationId: req.params.conversationId,
      senderId: req.user.id,
      textContent: req.body.textContent,
    });

    const io = req.app.get("io");

    if (io) {
      io.to(req.params.conversationId).emit("message:new", message);
    }

    return res.status(201).json(message);
  } catch (error) {
    next(error);
  }
};

export const createFileMessage = async (req, res, next) => {
  try {
    const message = await sendFileMessage({
      conversationId: req.params.conversationId,
      senderId: req.user.id,
      file: req.file,
    });

    const io = req.app.get("io");

    if (io) {
      io.to(req.params.conversationId).emit("message:new", message);
    }

    return res.status(201).json(message);
  } catch (error) {
    if (req.file) {
      try {
        await removeUploadedFile(req.file);
      } catch (cleanupError) {
        console.error("Failed to remove message upload:", cleanupError);
      }
    }
    next(error);
  }
};