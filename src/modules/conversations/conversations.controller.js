import {
  getMyConversations,
  createOrGetConversation,
} from "./conversations.service.js";

export const listMyConversations = async (req, res, next) => {
  try {
    const conversations = await getMyConversations(req.user.id);

    return res.status(200).json(conversations);
  } catch (error) {
    next(error);
  }
};

export const createConversation = async (req, res, next) => {
  try {
    const result = await createOrGetConversation({
      studentId: req.user.id,
      tutorId: req.body.tutorId,
      courseId: req.body.courseId,
    });

    return res.status(result.created ? 201 : 200).json(
      result.conversation
    );
  } catch (error) {
    next(error);
  }
};