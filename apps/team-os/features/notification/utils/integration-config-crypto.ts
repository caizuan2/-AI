import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ConfigError, ValidationError } from "@/lib/errors";
import type { IntegrationProvider } from "@/apps/team-os/features/notification/types";
import { normalizePlainIntegrationConfig } from "@/apps/team-os/features/notification/utils/notification-input";

const VERSION = "v1";

function encryptionKey() {
  const configured = process.env.TEAM_OS_INTEGRATION_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw new ConfigError("企业连接加密密钥未配置，已拒绝保存连接凭据。");
  }
  const candidates = [
    Buffer.from(configured, "base64url"),
    /^[0-9a-fA-F]{64}$/.test(configured) ? Buffer.from(configured, "hex") : Buffer.alloc(0)
  ];
  const key = candidates.find((candidate) => candidate.length === 32);
  if (!key) {
    throw new ConfigError("企业连接加密密钥格式无效，必须提供 32 字节 base64url 或 64 位十六进制密钥。");
  }
  return key;
}

function additionalAuthenticatedData(context: { companyId: string; provider: IntegrationProvider }) {
  return Buffer.from(`ai-team-os:${context.companyId}:${context.provider}:${VERSION}`, "utf8");
}

export function encryptIntegrationConfig(
  value: unknown,
  context: { companyId: string; provider: IntegrationProvider }
) {
  const config = normalizePlainIntegrationConfig(value);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(additionalAuthenticatedData(context));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".");
}

export function decryptIntegrationConfig(
  value: string,
  context: { companyId: string; provider: IntegrationProvider }
): Readonly<Record<string, string>> {
  try {
    const [version, ivValue, tagValue, ciphertextValue, ...extra] = value.split(".");
    if (version !== VERSION || !ivValue || !tagValue || !ciphertextValue || extra.length > 0) {
      throw new Error("invalid envelope");
    }
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAAD(additionalAuthenticatedData(context));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final()
    ]).toString("utf8");
    return Object.freeze(normalizePlainIntegrationConfig(JSON.parse(plaintext) as unknown));
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ValidationError("企业连接配置无法解密，请重新配置连接。");
  }
}

export function isEncryptedIntegrationConfig(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${VERSION}.`) && value.split(".").length === 4;
}
