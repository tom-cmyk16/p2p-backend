import dotenv from "dotenv";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/db.js";
import { AppError } from "../../utils/ApiError.js";

dotenv.config();

const googleCalendarScope = "https://www.googleapis.com/auth/calendar.events";

const requiredGoogleConfig = () => {
  const encryptionKey =
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "p2p-exam-google-token-encryption-key-32bytes-min";

  const config = {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim(),
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim(),
    redirectUri: process.env.GOOGLE_REDIRECT_URI?.trim(),
    encryptionKey,
  };

  const missing = [];
  if (!config.clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!config.clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!config.redirectUri) missing.push("GOOGLE_REDIRECT_URI");

  if (missing.length > 0) {
    console.error(`[GoogleCalendarService] Missing required environment variables: ${missing.join(", ")}`);
    console.error(`[GoogleCalendarService] Current environment variable status:`, {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? "PRESENT" : "UNDEFINED/EMPTY",
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? "PRESENT" : "UNDEFINED/EMPTY",
      GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI ? "PRESENT" : "UNDEFINED/EMPTY",
      GOOGLE_TOKEN_ENCRYPTION_KEY: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ? "PRESENT" : "MISSING (using fallback)",
    });

    throw new AppError(
      503,
      "GOOGLE_CALENDAR_NOT_CONFIGURED",
      `Google Calendar integration is not configured. Missing: ${missing.join(", ")}`
    );
  }

  return config;
};

const getEncryptionKey = (secret) => {
  const effectiveSecret =
    secret ||
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "p2p-exam-google-token-encryption-key-32bytes-min";

  return createHash("sha256").update(effectiveSecret).digest();
};

const encryptToken = (token) => {
  const config = requiredGoogleConfig();
  const key = getEncryptionKey(config.encryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
};

const decryptToken = (encryptedToken) => {
  const config = requiredGoogleConfig();
  const [iv, authTag, encrypted] = encryptedToken
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(config.encryptionKey),
    iv
  );
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
};

const googleRequest = async (url, options, message) => {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError(
      502,
      "GOOGLE_CALENDAR_REQUEST_FAILED",
      message,
      [{ status: response.status, reason: body.error?.message }]
    );
  }
  return body;
};

export const getGoogleConnectionStatus = async (tutorId) => {
  const account = await prisma.tutorGoogleAccount.findUnique({
    where: { tutorId },
    select: { connectedAt: true, calendarId: true },
  });
  return {
    connected: Boolean(account),
    connectedAt: account?.connectedAt || null,
    calendarId: account?.calendarId || null,
  };
};

export const getGoogleAuthorizationUrl = async (tutorId) => {
  const config = requiredGoogleConfig();
  const tutor = await prisma.tutorProfile.findUnique({
    where: { userId: tutorId },
    select: { userId: true },
  });
  if (!tutor) {
    throw new AppError(403, "FORBIDDEN", "Only approved tutors can connect Google Calendar");
  }

  const state = jwt.sign(
    { sub: tutorId, purpose: "google-calendar-connect" },
    process.env.JWT_SECRET,
    { expiresIn: "10m", issuer: "p2p-exam-preparation" }
  );
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: googleCalendarScope,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return authorizationUrl.toString();
};

export const completeGoogleAuthorization = async ({ code, state }) => {
  const config = requiredGoogleConfig();
  let decoded;
  try {
    decoded = jwt.verify(state, process.env.JWT_SECRET, {
      issuer: "p2p-exam-preparation",
    });
  } catch {
    throw new AppError(400, "INVALID_OAUTH_STATE", "Google authorization state is invalid or expired");
  }
  if (decoded.purpose !== "google-calendar-connect" || !decoded.sub) {
    throw new AppError(400, "INVALID_OAUTH_STATE", "Google authorization state is invalid or expired");
  }

  const tokenResponse = await googleRequest(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    },
    "Google authorization could not be completed"
  );
  if (!tokenResponse.refresh_token) {
    throw new AppError(
      502,
      "GOOGLE_REFRESH_TOKEN_MISSING",
      "Google did not issue a refresh token; reconnect and grant calendar access"
    );
  }

  const account = await prisma.tutorGoogleAccount.upsert({
    where: { tutorId: decoded.sub },
    create: {
      tutorId: decoded.sub,
      refreshToken: encryptToken(tokenResponse.refresh_token),
    },
    update: {
      refreshToken: encryptToken(tokenResponse.refresh_token),
    },
    select: { tutorId: true },
  });
  return account;
};

const getAccessToken = async (account) => {
  const config = requiredGoogleConfig();
  const tokenResponse = await googleRequest(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: decryptToken(account.refreshToken),
        grant_type: "refresh_token",
      }),
    },
    "Google Calendar access could not be refreshed"
  );
  if (!tokenResponse.access_token) {
    throw new AppError(502, "GOOGLE_ACCESS_TOKEN_MISSING", "Google did not return a Calendar access token");
  }
  return tokenResponse.access_token;
};

export const createGoogleMeetEvent = async ({
  tutorId,
  startsAt,
  endsAt,
  studentName,
  courseName,
}) => {
  const account = await prisma.tutorGoogleAccount.findUnique({
    where: { tutorId },
  });
  if (!account) {
    throw new AppError(
      409,
      "GOOGLE_CALENDAR_NOT_CONNECTED",
      "The assigned tutor must connect Google Calendar before sessions can be booked"
    );
  }
  const accessToken = await getAccessToken(account);
  const event = await googleRequest(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(account.calendarId)}/events?conferenceDataVersion=1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: `${courseName} mentorship session`,
        description: `P2P mentorship session with ${studentName}`,
        start: { dateTime: startsAt.toISOString(), timeZone: "UTC" },
        end: { dateTime: endsAt.toISOString(), timeZone: "UTC" },
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    },
    "Google Meet could not be created for a scheduled session"
  );
  const meetUrl = event.hangoutLink || event.conferenceData?.entryPoints?.find(
    (entryPoint) => entryPoint.entryPointType === "video"
  )?.uri;
  if (!event.id || !meetUrl || !/^https:\/\/meet\.google\.com\//.test(meetUrl)) {
    throw new AppError(
      502,
      "GOOGLE_MEET_LINK_MISSING",
      "Google Calendar did not return a valid Google Meet link"
    );
  }
  return { eventId: event.id, meetUrl };
};

export const deleteGoogleCalendarEvent = async ({ tutorId, eventId }) => {
  const account = await prisma.tutorGoogleAccount.findUnique({
    where: { tutorId },
  });
  if (!account) return;
  const accessToken = await getAccessToken(account);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(account.calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new AppError(
      502,
      "GOOGLE_CALENDAR_DELETE_FAILED",
      "A failed booking event could not be removed from Google Calendar"
    );
  }
};
