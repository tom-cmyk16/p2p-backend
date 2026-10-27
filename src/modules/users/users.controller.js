import {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  updateMyProfileImage,
} from "./users.service.js";

export const getMe = async (req, res, next) => {
  try {
    const user = await getMyProfile(req.user.id);

    return res.status(200).json(user);
  } catch (error) {
    console.error("[users.controller.getMe] Error fetching current user profile:", error);
    next(error);
  }
};

export const updateMe = async (req, res, next) => {
  try {
    const user = await updateMyProfile(
      req.user.id,
      req.body
    );

    return res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const result = await changeMyPassword(req.user.id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const updateProfileImage = async (req, res, next) => {
  try {
    const user = await updateMyProfileImage(req.user.id, req.file);
    return res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};