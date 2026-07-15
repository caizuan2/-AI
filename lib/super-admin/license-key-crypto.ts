import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { ConfigError } from "@/lib/errors";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_PREFIX = "aikb-license-key";
const IV_BYTES = 12;

export const LICENSE_KEY_ENCRYPTION_VERSION = 1;

function deriveKey(secret: string) {
  return createHash("sha256")
    .update(`${ENVELOPE_PREFIX}:v${LICENSE_KEY_ENCRYPTION_VERSION}:${secret}`)
    .digest();
}

function getKeyId(secret: string) {
  return createHash("sha256")
    .update(`${ENVELOPE_PREFIX}:key-id:${secret}`)
    .digest("hex")
    .slice(0, 16);
}

function getConfiguredSecrets() {
  const secrets = [
    process.env.LICENSE_KEY_ENCRYPTION_SECRET?.trim(),
    process.env.SESSION_SECRET?.trim()
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(secrets));
}

function getPrimarySecret(secretOverride?: string) {
  const secret = secretOverride?.trim() || getConfiguredSecrets()[0];

  if (!secret) {
    throw new ConfigError("卡密加密密钥未配置，请设置 LICENSE_KEY_ENCRYPTION_SECRET 或 SESSION_SECRET。");
  }

  return secret;
}

function getAdditionalAuthenticatedData(keyId: string) {
  return Buffer.from(`${ENVELOPE_PREFIX}:v${LICENSE_KEY_ENCRYPTION_VERSION}:${keyId}`, "utf8");
}

export function encryptLicenseKey(plainKey: string, secretOverride?: string) {
  const secret = getPrimarySecret(secretOverride);
  const keyId = getKeyId(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv);
  cipher.setAAD(getAdditionalAuthenticatedData(keyId));
  const encrypted = Buffer.concat([cipher.update(plainKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    `v${LICENSE_KEY_ENCRYPTION_VERSION}`,
    keyId,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

export function decryptLicenseKey(encryptedKey: string, secretOverrides?: readonly string[]) {
  const [version, keyId, encodedIv, encodedAuthTag, encodedCiphertext, ...extraParts] = encryptedKey.split(".");

  if (
    version !== `v${LICENSE_KEY_ENCRYPTION_VERSION}` ||
    !keyId ||
    !encodedIv ||
    !encodedAuthTag ||
    !encodedCiphertext ||
    extraParts.length > 0
  ) {
    throw new ConfigError("卡密密文格式无效，无法安全解密。");
  }

  const configuredSecrets = secretOverrides?.length
    ? secretOverrides.map((secret) => secret.trim()).filter(Boolean)
    : getConfiguredSecrets();
  const secret = configuredSecrets.find((candidate) => getKeyId(candidate) === keyId);

  if (!secret) {
    throw new ConfigError("当前卡密加密密钥与密文不匹配，请检查密钥轮换配置。");
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      deriveKey(secret),
      Buffer.from(encodedIv, "base64url")
    );
    decipher.setAAD(getAdditionalAuthenticatedData(keyId));
    decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new ConfigError("卡密密文校验失败，无法安全解密。");
  }
}
