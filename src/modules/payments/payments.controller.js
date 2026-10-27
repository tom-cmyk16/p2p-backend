import { AppError } from "../../utils/ApiError.js";
import {
  createCheckout as createCheckoutRecord,
  getPaymentReturnPath,
  getRevenueDashboard,
  getStudentPayment,
  listActiveOffers,
  listManagedOffers,
  listEligibleTutors,
  listStudentPayments,
  markPayoutPaid,
  processChapaWebhook,
  savePackageOffer,
  updateCommissionRate,
  verifyStudentPayment,
} from "./payments.service.js";

const handle = (action) => async (req, res, next) => {
  try {
    return await action(req, res);
  } catch (error) {
    return next(error);
  }
};

export const listOffers = handle(async (req, res) => {
  res.status(200).json(await listActiveOffers());
});

export const listAdminOffers = handle(async (req, res) => {
  res.status(200).json(await listManagedOffers());
});

export const getTutorsForOffer = handle(async (req, res) => {
  res.status(200).json(await listEligibleTutors(req.query));
});

export const createCheckout = handle(async (req, res) => {
  res.status(201).json(await createCheckoutRecord({
    ...req.body,
    studentId: req.user.id,
  }));
});

export const verifyPayment = handle(async (req, res) => {
  res.status(200).json(await verifyStudentPayment({
    txRef: req.params.txRef,
    studentId: req.user.id,
  }));
});

export const paymentStatus = handle(async (req, res) => {
  const payment = await getStudentPayment({
    txRef: req.params.txRef,
    studentId: req.user.id,
  });
  if (!payment) throw new AppError(404, "NOT_FOUND", "Payment not found");
  res.status(200).json(payment);
});

export const myPayments = handle(async (req, res) => {
  res.status(200).json(await listStudentPayments(req.user.id));
});

export const chapaCallback = handle(async (req, res) => {
  const txRef = typeof req.query.tx_ref === "string" ? req.query.tx_ref : "";
  if (!txRef) throw new AppError(400, "INVALID_CHAPA_CALLBACK", "Transaction reference is required");
  const returnUrl = await getPaymentReturnPath(txRef);
  res.redirect(303, returnUrl);
});

export const chapaWebhook = handle(async (req, res) => {
  res.status(200).json(await processChapaWebhook({
    headers: req.headers,
    rawBody: req.rawBody,
    body: req.body,
  }));
});

export const revenueDashboard = handle(async (req, res) => {
  res.status(200).json(await getRevenueDashboard({
    paymentPage: Number(req.query.paymentPage || 1),
    payoutPage: Number(req.query.payoutPage || 1),
    pageSize: Number(req.query.pageSize || 25),
  }));
});

export const saveOffer = handle(async (req, res) => {
  res.status(200).json(await savePackageOffer(req.body));
});

export const saveCommission = handle(async (req, res) => {
  res.status(200).json(await updateCommissionRate(req.body.commissionPercent));
});

export const settlePayout = handle(async (req, res) => {
  res.status(200).json(await markPayoutPaid({
    payoutId: req.params.payoutId,
    payoutReference: req.body.payoutReference,
  }));
});
