import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "crypto";
import { ConfigError, ValidationError } from "@/lib/errors";

interface TrainingScenarioTokenPayload {
  version: 1;
  userId: string;
  companyId: string;
  courseId: string;
  courseUpdatedAt: string;
  questionHash: string;
  standard: string;
  issuedAt: number;
  expiresAt: number;
}

function scenarioSecret() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new ConfigError("认证密钥未配置，无法生成 AI 培训场景凭证。");
  }
  return secret;
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

function encryptionKey() {
  return createHash("sha256")
    .update(`ai-team-os-training-scenario:${scenarioSecret()}`, "utf8")
    .digest();
}

function signature(encodedPayload: string) {
  return createHmac("sha256", scenarioSecret()).update(encodedPayload).digest("base64url");
}

function safeSignatureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createTrainingScenarioToken(input: {
  userId: string;
  companyId: string;
  courseId: string;
  courseUpdatedAt: string;
  question: string;
  standard: string;
}) {
  const issuedAt = Date.now();
  const payload: TrainingScenarioTokenPayload = {
    version: 1,
    userId: input.userId,
    companyId: input.companyId,
    courseId: input.courseId,
    courseUpdatedAt: input.courseUpdatedAt,
    questionHash: digest(input.question),
    standard: input.standard,
    issuedAt,
    expiresAt: issuedAt + 30 * 60 * 1_000
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const body = [
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url")
  ].join(".");
  return `${body}.${signature(body)}`;
}

export function verifyTrainingScenarioToken(input: {
  token: string;
  userId: string;
  companyId: string;
  courseId: string;
  courseUpdatedAt: string;
  question: string;
}) {
  try {
    const parts = input.token.split(".");
    if (parts.length !== 4 || parts.some((part) => !part)) throw new Error("invalid token");
    const body = parts.slice(0, 3).join(".");
    const expected = signature(body);
    if (!safeSignatureEqual(parts[3], expected)) throw new Error("invalid signature");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(parts[0], "base64url")
    );
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parts[1], "base64url")),
      decipher.final()
    ]).toString("utf8");
    const parsed = JSON.parse(decrypted) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid payload");
    const payload = parsed as Partial<TrainingScenarioTokenPayload>;
    const now = Date.now();
    if (
      payload.version !== 1 ||
      payload.userId !== input.userId ||
      payload.companyId !== input.companyId ||
      payload.courseId !== input.courseId ||
      payload.courseUpdatedAt !== input.courseUpdatedAt ||
      payload.questionHash !== digest(input.question) ||
      typeof payload.standard !== "string" ||
      !payload.standard.trim() ||
      payload.standard.length > 8_000 ||
      typeof payload.issuedAt !== "number" ||
      typeof payload.expiresAt !== "number" ||
      payload.issuedAt > now + 60_000 ||
      payload.expiresAt <= now ||
      payload.expiresAt - payload.issuedAt > 31 * 60 * 1_000
    ) {
      throw new Error("invalid claims");
    }
    return payload as TrainingScenarioTokenPayload;
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ValidationError("训练场景已失效或内容已变化，请重新生成模拟题目。");
  }
}
