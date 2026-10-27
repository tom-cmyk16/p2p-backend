import { createConversationRating, getConversationRating } from "./ratings.service.js";

export const getRating = async (req, res, next) => {
  try {
    const rating = await getConversationRating({
      conversationId: req.params.conversationId,
    });
    return res.status(200).json(rating);
  } catch (error) {
    next(error);
  }
};

export const createRating = async (req, res, next) => {
  try {
    const rating = await createConversationRating({
      conversationId: req.params.conversationId,
      studentId: req.user.id,
      score: req.body.score,
      comment: req.body.comment,
    });

    return res.status(201).json(rating);
  } catch (error) {
    next(error);
  }
};