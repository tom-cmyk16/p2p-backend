import {
  getTutorApplications,
  approveTutorApplication,
  rejectTutorApplication,
  getReports,
  getAdminDashboardOverview,
  updateReport,
  updateUserStatus,
  listUsers,
  verifyTutorByCall,
  getReportById,
  getReplacementTutorsForReport,
  reassignTutorForReport,
} from "./admin.service.js";
import {
  getTutorQualificationDocument as getStoredTutorQualificationDocument,
} from "../tutorApplications/tutorApplications.service.js";

/*
|--------------------------------------------------------------------------
| Tutor Applications
|--------------------------------------------------------------------------
*/

export const adminDashboardOverview = async (req, res, next) => {
  try {
    const overview = await getAdminDashboardOverview();
    return res.status(200).json(overview);
  } catch (error) {
    next(error);
  }
};

export const listTutorApplications = async (
  req,
  res,
  next
) => {
  try {
    const applications = await getTutorApplications({
      status: req.query.status,
    });

    return res.status(200).json(applications);
  } catch (error) {
    next(error);
  }
};

export const approveApplication = async (
  req,
  res,
  next
) => {
  try {
    const tutorProfile = await approveTutorApplication({
      applicationId: req.params.applicationId,
      adminId: req.user.id,
    });

    return res.status(200).json(tutorProfile);
  } catch (error) {
    next(error);
  }
};

export const getApplicationDocument = async (req, res, next) => {
  try {
    const document = await getStoredTutorQualificationDocument({
      userId: req.user.id,
      applicationId: req.params.applicationId,
      documentId: req.params.documentId,
      isAdmin: true,
    });
    const contentType = {
      ".pdf": "application/pdf",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
    }[document.extension];

    if (!contentType) {
      return res.status(415).json({
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "This tutor document format cannot be previewed",
        },
      });
    }

    return res
      .type(contentType)
      .set("Content-Disposition", `inline; filename="${document.fileName.replace(/[^\w.\- ]/g, "_")}"`)
      .set("X-Content-Type-Options", "nosniff")
      .set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'self'")
      .set("Cache-Control", "private, no-store")
      .sendFile(document.path, (error) => {
        if (error) next(error);
      });
  } catch (error) {
    next(error);
  }
};

export const rejectApplication = async (
  req,
  res,
  next
) => {
  try {
    const application = await rejectTutorApplication({
      applicationId: req.params.applicationId,
      adminId: req.user.id,
      rejectionReason: req.body.rejectionReason,
    });

    return res.status(200).json(application);
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| Reports
|--------------------------------------------------------------------------
*/

export const listReports = async (
  req,
  res,
  next
) => {
  try {
    const reports = await getReports({
      status: req.query.status,
    });

    return res.status(200).json(reports);
  } catch (error) {
    next(error);
  }
};

export const changeReportStatus = async (
  req,
  res,
  next
) => {
  try {
    const report = await updateReport({
      reportId: req.params.reportId,
      adminId: req.user.id,
      status: req.body.status,
    });

    return res.status(200).json(report);
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| Users
|--------------------------------------------------------------------------
*/

export const changeUserStatus = async (
  req,
  res,
  next
) => {
  try {
    const user = await updateUserStatus({
      userId: req.params.userId,
      status: req.body.status,
    });

    return res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

export const getUsersList = async (req, res, next) => {
  try {
    const users = await listUsers({
      role: req.query.role,
      status: req.query.status,
      search: req.query.search,
    });

    return res.status(200).json(users);
  } catch (error) {
    next(error);
  }
};

export const verifyTutorPhoneCall = async (req, res, next) => {
  try {
    const user = await verifyTutorByCall({
      userId: req.params.userId,
      adminId: req.user.id,
    });

    return res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

export const getReportDetails = async (req, res, next) => {
  try {
    const report = await getReportById({
      reportId: req.params.reportId,
    });

    return res.status(200).json(report);
  } catch (error) {
    next(error);
  }
};

export const listReplacementTutors = async (req, res, next) => {
  try {
    const data = await getReplacementTutorsForReport({
      reportId: req.params.reportId,
    });

    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

export const reassignReportMentor = async (req, res, next) => {
  try {
    const result = await reassignTutorForReport({
      reportId: req.params.reportId,
      adminId: req.user.id,
      newTutorId: req.body.newTutorId,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};