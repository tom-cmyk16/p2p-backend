import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";
import {
  addCalendarMonths,
  getMentorshipExpiry,
  packageRules,
} from "../learning/learning.rules.js";

const packageGrades = ["GRADE_9", "GRADE_10", "GRADE_11", "GRADE_12"];
const publicOfferSelect = {
  id: true,
  packageType: true,
  courseId: true,
  gradeLevel: true,
  amountMinor: true,
  currency: true,
  active: true,
  course: {
    select: {
      gradeLevel: true,
      contentAccessDays: true,
      mentorshipDurationDays: true,
      subject: { select: { name: true } },
    },
  },
};
const managedOfferSelect = {
  ...publicOfferSelect,
  standardAmountMinor: true,
  customAmountMinor: true,
  pricingMode: true,
};

const toMinorUnits = (amount) => {
  const minorUnits = Math.round(Number(amount) * 100);
  if (
    !Number.isSafeInteger(minorUnits) ||
    Math.abs(Number(amount) * 100 - minorUnits) > 1e-7
  ) {
    throw new AppError(422, "INVALID_PACKAGE_PRICE", "Prices must use no more than two decimal places");
  }
  return minorUnits;
};
const fromMinorUnits = (amountMinor) => (amountMinor / 100).toFixed(2);

const getOfferId = ({ packageType, courseId, gradeLevel }) =>
  `${packageType}:${courseId || gradeLevel || "all"}`;

const chapaConfig = () => {
  if (!process.env.CHAPA_SECRET_KEY) {
    throw new AppError(503, "CHAPA_NOT_CONFIGURED", "Chapa payments are not configured");
  }
  return {
    apiBase: (process.env.CHAPA_API_BASE_URL || "https://api.chapa.co/v1").replace(/\/+$/, ""),
    secretKey: process.env.CHAPA_SECRET_KEY,
  };
};

const chapaRequest = async (path, options = {}) => {
  const { apiBase, secretKey } = chapaConfig();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError(
      502,
      "CHAPA_REQUEST_FAILED",
      body.message || "Chapa could not process the payment request",
      [{ status: response.status }],
    );
  }
  return body;
};

const buildPaymentSelect = {
  id: true,
  txRef: true,
  packageType: true,
  courseId: true,
  gradeLevel: true,
  amountMinor: true,
  commissionBps: true,
  commissionMinor: true,
  tutorAmountMinor: true,
  currency: true,
  status: true,
  checkoutUrl: true,
  createdAt: true,
  verifiedAt: true,
  enrollment: { select: { id: true, startedAt: true, accessExpiresAt: true } },
  tutor: { select: { user: { select: { fullName: true } } } },
  course: { select: { gradeLevel: true, subject: { select: { name: true } } } },
};

const offerTarget = ({ packageType, courseId, gradeLevel }) => {
  if (packageType === "SINGLE_COURSE") {
    return { courseId, gradeLevel: null };
  }
  if (packageType === "FULL_GRADE") {
    return { courseId: null, gradeLevel };
  }
  return { courseId: null, gradeLevel: null };
};

export const listActiveOffers = async () => {
  const offers = await prisma.packageOffer.findMany({
    where: { active: true },
    select: publicOfferSelect,
    orderBy: [{ packageType: "asc" }, { gradeLevel: "asc" }, { course: { subject: { name: "asc" } } }],
  });
  return offers.map((offer) => ({
    ...offer,
    course: offer.course
      ? {
          ...offer.course,
          contentAccessDays: offer.course.contentAccessDays ?? 30,
          mentorshipDurationDays: offer.course.mentorshipDurationDays ?? 7,
        }
      : null,
  }));
};

export const listManagedOffers = async () => {
  const offers = await prisma.packageOffer.findMany({
    select: managedOfferSelect,
    orderBy: [{ packageType: "asc" }, { gradeLevel: "asc" }, { course: { subject: { name: "asc" } } }],
  });
  return offers.map((offer) => ({
    ...offer,
    course: offer.course
      ? {
          ...offer.course,
          contentAccessDays: offer.course.contentAccessDays ?? 30,
          mentorshipDurationDays: offer.course.mentorshipDurationDays ?? 7,
        }
      : null,
  }));
};

export const listEligibleTutors = async ({ packageType, courseId, gradeLevel }) => {
  const course = packageType === "SINGLE_COURSE"
    ? await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, subjectId: true, gradeLevel: true },
    })
    : null;
  if (packageType === "SINGLE_COURSE" && !course) {
    throw new AppError(404, "NOT_FOUND", "Course not found");
  }

  const tutorSubjectWhere = packageType === "SINGLE_COURSE"
    ? { subjectId: course.subjectId, gradeLevel: course.gradeLevel }
    : packageType === "FULL_GRADE"
      ? { gradeLevel }
      : { gradeLevel: { in: packageGrades } };

  return prisma.tutorProfile.findMany({
    where: {
      user: { is: { status: "APPROVED" } },
      subjects: { some: tutorSubjectWhere },
    },
    select: {
      userId: true,
      bio: true,
      educationLevel: true,
      institutionName: true,
      fieldOfStudy: true,
      yearOfStudy: true,
      user: {
        select: {
          fullName: true,
          phoneOrEmail: true,
          profileImageUrl: true,
        },
      },
      subjects: {
        where: tutorSubjectWhere,
        select: {
          gradeLevel: true,
          subject: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { user: { fullName: "asc" } },
  });
};

export const createCheckout = async ({ studentId, offerId, tutorId, email, phoneNumber }) => {
  chapaConfig();
  const callbackUrl =
    process.env.CHAPA_CALLBACK_URL ||
    "http://localhost:3000/api/v1/payments/webhook";
  const frontendUrl =
    (process.env.FRONTEND_URL?.split(",")[0] ||
      process.env.CHAPA_RETURN_URL ||
      "http://localhost:5173"
    ).trim().replace(/\/+$/, "");
  const offer = await prisma.packageOffer.findUnique({
    where: { id: offerId },
    select: publicOfferSelect,
  });
  if (!offer || !offer.active) {
    throw new AppError(404, "OFFER_NOT_AVAILABLE", "This package is not currently available for purchase");
  }
  const [student, tutor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, fullName: true, role: true },
    }),
    prisma.tutorProfile.findUnique({
      where: { userId: tutorId },
      select: { userId: true, user: { select: { status: true } } },
    }),
  ]);
  if (!student || student.role !== "STUDENT") {
    throw new AppError(403, "FORBIDDEN", "Only students can purchase learning packages");
  }
  if (!tutor || tutor.user.status !== "APPROVED") {
    throw new AppError(404, "TUTOR_NOT_AVAILABLE", "The selected tutor is not available");
  }

  if (offer.courseId) {
    const existingActiveEnrollment = await prisma.packageEnrollment.findFirst({
      where: {
        studentId,
        courseId: offer.courseId,
        assignedTutorId: { not: null },
        mentorshipExpiresAt: { gt: new Date() },
      },
      include: {
        assignedTutor: {
          include: {
            user: { select: { fullName: true } },
          },
        },
      },
    });

    if (existingActiveEnrollment) {
      const currentMentorName = existingActiveEnrollment.assignedTutor?.user?.fullName || "an assigned tutor";
      throw new AppError(
        409,
        "COURSE_MENTOR_ALREADY_ASSIGNED",
        `You already have an active mentor (${currentMentorName}) for this course. Only one mentor is permitted per course.`
      );
    }
  }

  const tutors = await listEligibleTutors({
    packageType: offer.packageType,
    courseId: offer.courseId || undefined,
    gradeLevel: offer.gradeLevel || undefined,
  });
  if (!tutors.some((item) => item.userId === tutorId)) {
    throw new AppError(422, "TUTOR_PACKAGE_MISMATCH", "The selected tutor does not teach this package");
  }
  const config = await prisma.paymentConfig.findUnique({
    where: { id: "default" },
    select: { commissionBps: true },
  });
  const commissionBps = config?.commissionBps ?? 1000;
  const commissionMinor = Math.round(offer.amountMinor * commissionBps / 10000);
  const tutorAmountMinor = offer.amountMinor - commissionMinor;
  const txRef = `P2P-${randomUUID()}`;
  const payment = await prisma.payment.create({
    data: {
      txRef,
      studentId,
      tutorId,
      packageType: offer.packageType,
      courseId: offer.courseId,
      gradeLevel: offer.packageType === "SINGLE_COURSE"
        ? offer.course?.gradeLevel
        : offer.gradeLevel,
      amountMinor: offer.amountMinor,
      commissionBps,
      commissionMinor,
      tutorAmountMinor,
      currency: "ETB",
      status: "INITIALIZING",
    },
  });

  const names = student.fullName.trim().split(/\s+/);
  try {
    const result = await chapaRequest("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        amount: fromMinorUnits(offer.amountMinor),
        currency: "ETB",
        email,
        first_name: names[0],
        last_name: names.slice(1).join(" ") || names[0],
        ...(phoneNumber ? { phone_number: phoneNumber } : {}),
        tx_ref: txRef,
        callback_url: callbackUrl,
        return_url: process.env.CHAPA_RETURN_URL
          ? (process.env.CHAPA_RETURN_URL.includes("?")
              ? `${process.env.CHAPA_RETURN_URL}&tx_ref=${encodeURIComponent(txRef)}`
              : `${process.env.CHAPA_RETURN_URL}?tx_ref=${encodeURIComponent(txRef)}`)
          : `${frontendUrl}/student/packages/payment-result?tx_ref=${encodeURIComponent(txRef)}`,
        customization: {
          title: "P2P Exam Prep",
          description: `${offer.packageType.replaceAll("_", " ")} package`,
        },
      }),
    });
    if (String(result.status || "").toLowerCase() !== "success") {
      throw new AppError(502, "CHAPA_INITIALIZATION_FAILED", "Chapa did not initialize the transaction");
    }
    const checkoutUrl = result.data?.checkout_url;
    let parsedCheckoutUrl;
    try {
      parsedCheckoutUrl = new URL(checkoutUrl);
    } catch {
      throw new AppError(502, "CHAPA_CHECKOUT_URL_INVALID", "Chapa did not return a valid checkout URL");
    }
    if (
      parsedCheckoutUrl.protocol !== "https:" ||
      !(parsedCheckoutUrl.hostname === "chapa.co" || parsedCheckoutUrl.hostname.endsWith(".chapa.co"))
    ) {
      throw new AppError(502, "CHAPA_CHECKOUT_URL_INVALID", "Chapa returned an untrusted checkout URL");
    }
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PENDING",
        checkoutUrl: parsedCheckoutUrl.toString(),
        chapaReference: result.data?.reference || null,
      },
    });
    return { txRef, checkoutUrl: parsedCheckoutUrl.toString() };
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failureReason: error.message.slice(0, 500),
      },
    });
    throw error;
  }
};

const verifyChapaTransaction = async (txRef) => {
  const response = await chapaRequest(`/transaction/verify/${encodeURIComponent(txRef)}`);
  if (String(response.status || "").toLowerCase() !== "success" || !response.data) {
    throw new AppError(502, "CHAPA_VERIFICATION_FAILED", "Chapa did not return a verified transaction");
  }
  return response.data;
};

const fulfillVerifiedPayment = async (payment, chapaData) => {
  const providerTxRef = chapaData.tx_ref || chapaData.txRef;
  if (providerTxRef !== payment.txRef) {
    throw new AppError(409, "PAYMENT_REFERENCE_MISMATCH", "Verified payment reference did not match the order");
  }
  const verifiedAmount = Number(chapaData.amount);
  const verifiedMinor = Math.round(verifiedAmount * 100);
  if (
    !Number.isFinite(verifiedAmount) ||
    verifiedMinor !== payment.amountMinor ||
    String(chapaData.currency || "").toUpperCase() !== payment.currency
  ) {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: { not: "PAID" } },
      data: { status: "FAILED", failureReason: "Verified amount or currency did not match the order" },
    });
    throw new AppError(409, "PAYMENT_AMOUNT_MISMATCH", "Verified payment amount or currency did not match the order");
  }

  const now = new Date();
  const rule = packageRules[payment.packageType];

  let accessDays = null;
  let mentorshipDays = null;
  let resolvedGradeLevel = payment.gradeLevel || null;

  if (payment.courseId) {
    const course = await prisma.course.findUnique({
      where: { id: payment.courseId },
      select: { gradeLevel: true, contentAccessDays: true, mentorshipDurationDays: true },
    });
    if (course) {
      accessDays = course.contentAccessDays;
      mentorshipDays = course.mentorshipDurationDays;
      if (!resolvedGradeLevel && course.gradeLevel) {
        resolvedGradeLevel = course.gradeLevel;
      }
    }
  }

  const accessExpiresAt = accessDays
    ? new Date(now.getTime() + accessDays * 24 * 60 * 60 * 1000)
    : addCalendarMonths(now, rule.accessMonths);

  const mentorshipExpiresAt = mentorshipDays
    ? new Date(now.getTime() + mentorshipDays * 24 * 60 * 60 * 1000)
    : getMentorshipExpiry(now, rule);

  const enrollmentData = {
    studentId: payment.studentId,
    packageType: payment.packageType,
    ...(payment.courseId ? { courseId: payment.courseId } : {}),
    ...(resolvedGradeLevel ? { gradeLevel: resolvedGradeLevel } : {}),
    mentorshipMonths: rule.mentorshipMonths,
    accessMonths: rule.accessMonths,
    contentAccessDays: accessDays || (rule.accessMonths * 30),
    mentorshipDurationDays: mentorshipDays || (rule.mentorshipDays || rule.mentorshipMonths * 30),
    liveSessionCount: rule.liveSessionCount,
    startedAt: now,
    mentorshipExpiresAt,
    accessExpiresAt,
    paymentId: payment.id,
    assignedTutorId: payment.tutorId,
  };

  return prisma.$transaction(async (tx) => {
    const currentPayment = await tx.payment.findUnique({
      where: { id: payment.id },
      select: { status: true, enrollment: { select: { id: true } } },
    });
    if (currentPayment?.status === "PAID") {
      return { alreadyProcessed: true, enrollmentId: currentPayment.enrollment?.id };
    }
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ["INITIALIZING", "PENDING"] } },
      data: {
        status: "PAID",
        verifiedAt: now,
        chapaReference: chapaData.reference || payment.chapaReference,
        failureReason: null,
      },
    });
    if (claimed.count !== 1) {
      const latest = await tx.payment.findUnique({
        where: { id: payment.id },
        select: { status: true, enrollment: { select: { id: true } } },
      });
      if (latest?.status === "PAID") {
        return { alreadyProcessed: true, enrollmentId: latest.enrollment?.id };
      }
      throw new AppError(409, "PAYMENT_NOT_PAYABLE", "This payment is not eligible for fulfillment");
    }

    const existingEnrollment = await tx.packageEnrollment.findUnique({
      where: { paymentId: payment.id },
    });

    let enrollment = existingEnrollment;
    if (!enrollment) {
      try {
        enrollment = await tx.packageEnrollment.create({ data: enrollmentData });
      } catch (createError) {
        if (
          createError.message?.includes("contentAccessDays") ||
          createError.message?.includes("mentorshipDurationDays") ||
          createError.code === "P2009"
        ) {
          const { contentAccessDays, mentorshipDurationDays, ...legacyData } = enrollmentData;
          enrollment = await tx.packageEnrollment.create({ data: legacyData });
          await tx.$executeRawUnsafe(
            `UPDATE "package_enrollments" SET "content_access_days" = $1, "mentorship_duration_days" = $2 WHERE "id" = $3`,
            enrollmentData.contentAccessDays,
            enrollmentData.mentorshipDurationDays,
            enrollment.id,
          );
        } else {
          throw createError;
        }
      }
    }

    if (payment.tutorId) {
      await tx.tutorPayout.upsert({
        where: { paymentId: payment.id },
        create: {
          paymentId: payment.id,
          tutorId: payment.tutorId,
          amountMinor: payment.tutorAmountMinor,
          currency: payment.currency,
        },
        update: {},
      });
    }
    return { alreadyProcessed: false, enrollmentId: enrollment.id };
  });
};

export const verifyStudentPayment = async ({ txRef, studentId }) => {
  const payment = await prisma.payment.findUnique({
    where: { txRef },
    select: { ...buildPaymentSelect, studentId: true, tutorId: true },
  });
  if (!payment || payment.studentId !== studentId) {
    throw new AppError(404, "NOT_FOUND", "Payment not found");
  }
  if (payment.status === "PAID") return payment;
  const chapaData = await verifyChapaTransaction(txRef);
  const providerStatus = String(chapaData.status || "").toUpperCase();
  if (providerStatus === "SUCCESS") {
    await fulfillVerifiedPayment(payment, chapaData);
  } else if (["FAILED", "EXPIRED", "CANCELLED"].includes(providerStatus)) {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: { not: "PAID" } },
      data: {
        status: "FAILED",
        failureReason: `Chapa transaction status: ${providerStatus}`,
      },
    });
  } else {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "INITIALIZING" },
      data: { status: "PENDING" },
    });
  }
  return prisma.payment.findUnique({
    where: { txRef },
    select: { ...buildPaymentSelect, studentId: true },
  });
};

export const processChapaWebhook = async ({ headers = {}, rawBody, body = {}, query = {} }) => {
  const txRef =
    body?.tx_ref ||
    body?.data?.tx_ref ||
    body?.trx_ref ||
    body?.data?.trx_ref ||
    headers["x-chapa-tx-ref"] ||
    query?.tx_ref ||
    query?.trx_ref;

  if (typeof txRef !== "string" || !txRef.trim()) {
    throw new AppError(422, "INVALID_CHAPA_WEBHOOK", "Webhook does not contain a transaction reference");
  }
  const cleanTxRef = txRef.trim();

  const secret = process.env.CHAPA_WEBHOOK_SECRET;
  const isCustomSecret = Boolean(secret && secret !== "your_chapa_webhook_secret");

  if (isCustomSecret && rawBody) {
    const expectedSignatures = [
      createHmac("sha256", secret).update(secret).digest("hex"),
      createHmac("sha256", secret).update(rawBody).digest("hex"),
    ];
    const suppliedSignatures = [
      headers["x-chapa-signature"],
      headers["x-chapa-signature-256"],
    ]
      .filter((value) => typeof value === "string")
      .map((value) => value.replace(/^sha256=/i, "").trim().toLowerCase());

    suppliedSignatures.some((signature) =>
      expectedSignatures.some((expected) => {
        const actualBytes = Buffer.from(signature, "hex");
        const expectedBytes = Buffer.from(expected, "hex");
        return actualBytes.length === expectedBytes.length &&
          timingSafeEqual(actualBytes, expectedBytes);
      })
    );
  }

  const payment = await prisma.payment.findUnique({
    where: { txRef: cleanTxRef },
    select: { ...buildPaymentSelect, studentId: true, tutorId: true },
  });
  if (!payment) return { accepted: true, processed: false };
  if (payment.status === "PAID") return { accepted: true, processed: true };

  const chapaData = await verifyChapaTransaction(cleanTxRef);
  const providerStatus = String(chapaData?.status || "").toUpperCase();
  if (providerStatus === "SUCCESS") {
    await fulfillVerifiedPayment(payment, chapaData);
  } else if (["FAILED", "EXPIRED", "CANCELLED"].includes(providerStatus)) {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: { not: "PAID" } },
      data: { status: "FAILED", failureReason: `Chapa transaction status: ${chapaData.status}` },
    });
  }
  return { accepted: true, processed: true };
};

export const getStudentPayment = ({ txRef, studentId }) =>
  prisma.payment.findFirst({
    where: { txRef, studentId },
    select: buildPaymentSelect,
  });

export const listStudentPayments = (studentId) =>
  prisma.payment.findMany({
    where: { studentId },
    select: buildPaymentSelect,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

export const getRevenueDashboard = async ({
  paymentPage = 1,
  payoutPage = 1,
  pageSize = 25,
} = {}) => {
  // Sync recent pending or initializing payments against Chapa
  const pendingPayments = await prisma.payment.findMany({
    where: { status: { in: ["INITIALIZING", "PENDING"] } },
    select: { ...buildPaymentSelect, studentId: true, tutorId: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (pendingPayments.length > 0 && process.env.CHAPA_SECRET_KEY) {
    await Promise.allSettled(
      pendingPayments.map(async (payment) => {
        try {
          const chapaData = await verifyChapaTransaction(payment.txRef);
          const providerStatus = String(chapaData?.status || "").toUpperCase();
          if (providerStatus === "SUCCESS") {
            await fulfillVerifiedPayment(payment, chapaData);
          } else if (["FAILED", "EXPIRED", "CANCELLED"].includes(providerStatus)) {
            await prisma.payment.updateMany({
              where: { id: payment.id, status: { not: "PAID" } },
              data: {
                status: "FAILED",
                failureReason: `Chapa transaction status: ${providerStatus}`,
              },
            });
          }
        } catch {
          // Keep current status if Chapa is unreachable or txRef not found yet
        }
      })
    );
  }

  const [paid, pending, payments, paymentTotal, payoutTotals, payouts, payoutTotal, config, offers] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: "PAID" },
      _sum: { amountMinor: true, commissionMinor: true, tutorAmountMinor: true },
      _count: { id: true },
    }),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.payment.findMany({
      select: {
        ...buildPaymentSelect,
        student: { select: { fullName: true, phoneOrEmail: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (paymentPage - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.count(),
    prisma.tutorPayout.groupBy({
      by: ["status"],
      _sum: { amountMinor: true },
      _count: { id: true },
    }),
    prisma.tutorPayout.findMany({
      select: {
        id: true,
        amountMinor: true,
        currency: true,
        status: true,
        payoutReference: true,
        createdAt: true,
        paidAt: true,
        tutor: { select: { user: { select: { fullName: true, phoneOrEmail: true } } } },
        payment: { select: { txRef: true, student: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (payoutPage - 1) * pageSize,
      take: pageSize,
    }),
    prisma.tutorPayout.count(),
    prisma.paymentConfig.findUnique({ where: { id: "default" } }),
    prisma.packageOffer.findMany({
      select: managedOfferSelect,
      orderBy: [{ packageType: "asc" }, { gradeLevel: "asc" }],
    }),
  ]);
  return {
    summary: {
      totalSalesMinor: paid._sum.amountMinor || 0,
      platformCommissionMinor: paid._sum.commissionMinor || 0,
      tutorEarningsMinor: paid._sum.tutorAmountMinor || 0,
      paidTransactions: paid._count.id,
      pendingTransactions: pending,
      unpaidPayoutMinor: payoutTotals.find((item) => item.status === "AVAILABLE")?._sum.amountMinor || 0,
      paidPayoutMinor: payoutTotals.find((item) => item.status === "PAID")?._sum.amountMinor || 0,
    },
    commissionPercent: (config?.commissionBps ?? 1000) / 100,
    payments: {
      items: payments,
      total: paymentTotal,
      page: paymentPage,
      pageSize,
    },
    payouts: {
      items: payouts,
      total: payoutTotal,
      page: payoutPage,
      pageSize,
    },
    offers,
  };
};

export const savePackageOffer = async ({
  packageType,
  courseId,
  gradeLevel,
  amount,
  standardAmount,
  customAmount,
  pricingMode = "STANDARD",
  active,
}) => {

  console.log("Incoming Package Offer Data:", { packageType, courseId, gradeLevel, amount, pricingMode });
  const target = offerTarget({ packageType, courseId, gradeLevel });
  const standardAmountMinor = toMinorUnits(standardAmount ?? amount);
  const customAmountMinor = customAmount === undefined
    ? null
    : toMinorUnits(customAmount);
  if (pricingMode === "CUSTOM" && customAmountMinor === null) {
    throw new AppError(422, "INVALID_PACKAGE_PRICE", "A custom price is required in custom pricing mode");
  }
  const amountMinor = pricingMode === "CUSTOM"
    ? customAmountMinor
    : standardAmountMinor;
  if (packageType === "SINGLE_COURSE") {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) throw new AppError(404, "NOT_FOUND", "Course not found");
  }
  return prisma.packageOffer.upsert({
    where: { id: getOfferId({ packageType, courseId, gradeLevel }) },
    create: {
      id: getOfferId({ packageType, courseId, gradeLevel }),
      packageType,
      ...target,
      amountMinor,
      standardAmountMinor,
      customAmountMinor: pricingMode === "CUSTOM" ? customAmountMinor : null,
      pricingMode,
      active,
      currency: "ETB",
    },
    update: {
      amountMinor,
      standardAmountMinor,
      customAmountMinor: pricingMode === "CUSTOM" ? customAmountMinor : null,
      pricingMode,
      active,
    },
    select: managedOfferSelect,
  });
};

export const updateCommissionRate = async (commissionPercent) => {
  if (Math.abs(commissionPercent * 100 - Math.round(commissionPercent * 100)) > 1e-7) {
    throw new AppError(422, "INVALID_COMMISSION_RATE", "Commission rate must use no more than two decimal places");
  }
  const commissionBps = Math.round(commissionPercent * 100);
  const config = await prisma.paymentConfig.upsert({
    where: { id: "default" },
    create: { id: "default", commissionBps },
    update: { commissionBps },
  });
  return { commissionPercent: config.commissionBps / 100 };
};

export const markPayoutPaid = async ({ payoutId, payoutReference }) => {
  const result = await prisma.tutorPayout.updateMany({
    where: { id: payoutId, status: "AVAILABLE" },
    data: { status: "PAID", payoutReference, paidAt: new Date() },
  });
  if (result.count !== 1) {
    throw new AppError(409, "PAYOUT_NOT_AVAILABLE", "Payout was not found or has already been settled");
  }
  return prisma.tutorPayout.findUnique({
    where: { id: payoutId },
    select: { id: true, status: true, payoutReference: true, paidAt: true },
  });
};

export const getPaymentReturnPath = async (txRef) => {
  const payment = await prisma.payment.findUnique({
    where: { txRef },
    select: { id: true, studentId: true },
  });
  if (!payment) throw new AppError(404, "NOT_FOUND", "Payment not found");
  await verifyStudentPayment({ txRef, studentId: payment.studentId });
  const frontendUrl = (
    process.env.FRONTEND_URL?.split(",")[0] ||
    process.env.CHAPA_RETURN_URL ||
    "http://localhost:5173"
  ).trim().replace(/\/+$/, "");
  return `${frontendUrl}/payment/success?tx_ref=${encodeURIComponent(txRef)}`;
};
