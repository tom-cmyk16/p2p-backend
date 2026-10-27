import { createReport as createReportService } from "./reports.service.js";

export const createReport = async (req, res, next) => {
  try {
    const report = await createReportService({
      reporterId: req.user.id,
      targetType: req.body.targetType,
      targetId: req.body.targetId,
      reason: req.body.reason,
    });

    return res.status(201).json(report);
  } catch (error) {
    next(error);
  }
};