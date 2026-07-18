import "server-only";

import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";

type StoredUserAvatar = {
  fileName?: string | null;
  updatedAt?: string | null;
};

const AVATAR_PROFILE_VERSION = 1;

export function getAvatarUploadRoot() {
  return (
    process.env.CHAT_AVATAR_UPLOAD_DIR?.trim() ||
    process.env.UPLOAD_DIR?.trim() ||
    (process.env.NODE_ENV === "production"
      ? "/var/www/ai-knowledge/uploads"
      : path.join(process.cwd(), "public", "uploads"))
  );
}

export function getAvatarDirectory() {
  return path.join(getAvatarUploadRoot(), "avatars");
}

export function isSafeAvatarFileName(fileName: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/.test(fileName) && !fileName.includes("..");
}

export function getAvatarMimeType(fileName: string) {
  const extension = path.extname(fileName).slice(1).toLowerCase();

  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  return "image/png";
}

function getSafeUserProfileName(userId: string) {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getAvatarProfilePath(userId: string) {
  return path.join(getAvatarDirectory(), ".profiles", `${getSafeUserProfileName(userId)}.json`);
}

function buildAvatarApiUrl(_request: Request, fileName: string, version: string | number) {
  const url = new URL(`/api/auth/avatar/${encodeURIComponent(fileName)}`, "http://avatar.local");
  url.searchParams.set("v", String(version));

  return `${url.pathname}${url.search}`;
}

export async function writeUserAvatarProfile(userId: string, fileName: string, request: Request) {
  if (!isSafeAvatarFileName(fileName)) {
    return null;
  }

  const updatedAt = new Date().toISOString();
  const profilePath = getAvatarProfilePath(userId);

  await mkdir(path.dirname(profilePath), { recursive: true });
  await writeFile(
    profilePath,
    JSON.stringify(
      {
        version: AVATAR_PROFILE_VERSION,
        fileName,
        updatedAt
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    avatar_url: buildAvatarApiUrl(request, fileName, Date.now()),
    updated_at: updatedAt
  };
}

export async function clearUserAvatarProfile(userId: string) {
  const updatedAt = new Date().toISOString();
  const profilePath = getAvatarProfilePath(userId);

  await mkdir(path.dirname(profilePath), { recursive: true });
  await writeFile(
    profilePath,
    JSON.stringify(
      {
        version: AVATAR_PROFILE_VERSION,
        fileName: null,
        updatedAt
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    avatar_url: null,
    updated_at: updatedAt
  };
}

export async function readUserAvatarProfile(userId: string, request: Request) {
  let profile: StoredUserAvatar | null = null;

  try {
    profile = JSON.parse(await readFile(getAvatarProfilePath(userId), "utf8")) as StoredUserAvatar;
  } catch {
    return null;
  }

  const fileName = typeof profile.fileName === "string" ? profile.fileName.trim() : "";

  if (!fileName || !isSafeAvatarFileName(fileName)) {
    return null;
  }

  try {
    const fileStat = await stat(path.join(getAvatarDirectory(), fileName));

    return {
      avatar_url: buildAvatarApiUrl(request, fileName, Math.floor(fileStat.mtimeMs)),
      updated_at: profile.updatedAt ?? fileStat.mtime.toISOString()
    };
  } catch {
    return null;
  }
}
