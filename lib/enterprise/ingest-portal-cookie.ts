import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants";
import { resolveSessionCookieSecure } from "@/lib/auth/session-cookie";

export const INGEST_PORTAL_COOKIE_NAME = "ai_kb_ingest_gate";

type IngestPortalCookiePayload = {
  userId: string;
  licenseActivated: boolean;
  expiresAt: number;
};

type VerifiedIngestPortalCookie = {
  valid: boolean;
  userId: string | null;
  licenseActivated: boolean;
  expiresAt: number | null;
};

const encoder = new TextEncoder();

function readPortalSecret() {
  return process.env.SESSION_SECRET?.trim()
    || process.env.LICENSE_SECRET?.trim()
    || "aikb-ingest-portal-v1-dev-secret";
}

function toBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${normalized}${"=".repeat((4 - normalized.length % 4) % 4)}`;

  return atob(padded);
}

function bytesToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(readPortalSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));

  return bytesToHex(signature);
}

export function getIngestPortalCookieOptions(request?: Request, expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: resolveSessionCookieSecure(request),
    path: "/",
    expires: expiresAt,
    maxAge: Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  };
}

export async function createIngestPortalCookieValue(input: {
  userId: string;
  licenseActivated: boolean;
  expiresAt?: Date;
}) {
  const payload: IngestPortalCookiePayload = {
    userId: input.userId,
    licenseActivated: input.licenseActivated,
    expiresAt: input.expiresAt?.getTime() ?? Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = await sign(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export async function verifyIngestPortalCookieValue(value?: string | null): Promise<VerifiedIngestPortalCookie> {
  if (!value) {
    return { valid: false, userId: null, licenseActivated: false, expiresAt: null };
  }

  const [encodedPayload, signature] = value.split(".");

  if (!encodedPayload || !signature) {
    return { valid: false, userId: null, licenseActivated: false, expiresAt: null };
  }

  const expectedSignature = await sign(encodedPayload);

  if (!timingSafeEqual(signature, expectedSignature)) {
    return { valid: false, userId: null, licenseActivated: false, expiresAt: null };
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as Partial<IngestPortalCookiePayload>;

    if (!payload.userId || typeof payload.expiresAt !== "number" || payload.expiresAt <= Date.now()) {
      return { valid: false, userId: null, licenseActivated: false, expiresAt: null };
    }

    return {
      valid: true,
      userId: payload.userId,
      licenseActivated: payload.licenseActivated === true,
      expiresAt: payload.expiresAt
    };
  } catch {
    return { valid: false, userId: null, licenseActivated: false, expiresAt: null };
  }
}
