import "server-only";

import { randomUUID } from "node:crypto";
import { ValidationError } from "@/lib/errors";

const PROFILE_VERSION = 1;
const MAX_PROFILE_NAME_LENGTH = 20;
const IMAGE_ID_PATTERN = /^[a-f0-9]{64}\.(?:avif|bmp|gif|jpg|png|webp)$/;

export type AdminIngestAccountProfile = {
  version: typeof PROFILE_VERSION;
  name: string | null;
  avatarImageId: string | null;
  updatedAt: string | null;
};

function emptyProfile(): AdminIngestAccountProfile {
  return {
    version: PROFILE_VERSION,
    name: null,
    avatarImageId: null,
    updatedAt: null
  };
}

function safeOwnerId(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "anonymous";
}

function readConfiguredProfileDir() {
  return (
    process.env.ADMIN_INGEST_PROFILE_DIR
    || process.env.AI_KB_ADMIN_INGEST_PROFILE_DIR
    || ""
  ).trim();
}

async function getAdminIngestProfileDir() {
  const path = await import("node:path");
  const configured = readConfiguredProfileDir();

  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }

  if (process.platform !== "win32" && process.cwd().startsWith("/var/www/ai-knowledge-main-")) {
    return "/var/www/ai-knowledge-shared/admin-ingest/profiles";
  }

  return path.join(process.cwd(), "artifacts", "admin-ingest", "profiles");
}

async function getProfilePath(ownerUserId: string) {
  const path = await import("node:path");
  const root = await getAdminIngestProfileDir();

  return path.join(root, `user-${safeOwnerId(ownerUserId)}.json`);
}

function normalizeStoredProfile(value: unknown): AdminIngestAccountProfile {
  if (!value || typeof value !== "object") {
    return emptyProfile();
  }

  const candidate = value as Partial<AdminIngestAccountProfile>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const avatarImageId = typeof candidate.avatarImageId === "string"
    ? candidate.avatarImageId.trim().toLowerCase()
    : "";
  const updatedAt = typeof candidate.updatedAt === "string" ? candidate.updatedAt.trim() : "";

  return {
    version: PROFILE_VERSION,
    name: name && Array.from(name).length <= MAX_PROFILE_NAME_LENGTH ? name : null,
    avatarImageId: IMAGE_ID_PATTERN.test(avatarImageId) ? avatarImageId : null,
    updatedAt: updatedAt || null
  };
}

export async function readAdminIngestAccountProfile(
  ownerUserId: string
): Promise<AdminIngestAccountProfile> {
  const fs = await import("node:fs/promises");
  const profilePath = await getProfilePath(ownerUserId);

  try {
    return normalizeStoredProfile(JSON.parse(await fs.readFile(profilePath, "utf8")));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

    if (code === "ENOENT" || error instanceof SyntaxError) {
      return emptyProfile();
    }

    throw error;
  }
}

async function writeAdminIngestAccountProfile(
  ownerUserId: string,
  patch: Partial<Pick<AdminIngestAccountProfile, "name" | "avatarImageId">>
) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const profilePath = await getProfilePath(ownerUserId);
  const current = await readAdminIngestAccountProfile(ownerUserId);
  const nextProfile: AdminIngestAccountProfile = {
    ...current,
    ...patch,
    version: PROFILE_VERSION,
    updatedAt: new Date().toISOString()
  };
  const temporaryPath = path.join(
    path.dirname(profilePath),
    `.${path.basename(profilePath)}-${randomUUID()}.tmp`
  );

  await fs.mkdir(path.dirname(profilePath), { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(nextProfile, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, profilePath);

  return nextProfile;
}

export async function writeAdminIngestAccountName(input: {
  ownerUserId: string;
  name: string;
}) {
  const name = input.name.trim();
  const nameLength = Array.from(name).length;

  if (nameLength < 2 || nameLength > MAX_PROFILE_NAME_LENGTH) {
    throw new ValidationError("名称长度需要在 2 到 20 个字符之间。");
  }

  return writeAdminIngestAccountProfile(input.ownerUserId, { name });
}

export async function writeAdminIngestAccountAvatar(input: {
  ownerUserId: string;
  avatarImageId: string;
}) {
  const avatarImageId = input.avatarImageId.trim().toLowerCase();

  if (!IMAGE_ID_PATTERN.test(avatarImageId)) {
    throw new ValidationError("头像地址无效，请重新上传。");
  }

  return writeAdminIngestAccountProfile(input.ownerUserId, { avatarImageId });
}
