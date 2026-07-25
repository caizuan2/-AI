"use client";

export const ADMIN_INGEST_AVATAR_CACHE_KEY = "admin-ingest-avatar";

type AdminIngestAccountProfileResponse = {
  name: string | null;
  avatarUrl: string | null;
  hasCustomName: boolean;
  hasCustomAvatar: boolean;
};

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  message?: string;
  error?: {
    message?: string;
  };
};

type AvatarCacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isLegacyAvatarCacheValue(value: string) {
  const normalized = value.trim().toLowerCase();

  return normalized.startsWith("data:image/") || normalized.startsWith("blob:");
}

export function readAdminIngestAvatarCache(storage: AvatarCacheStorage) {
  try {
    return storage.getItem(ADMIN_INGEST_AVATAR_CACHE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function clearAdminIngestAvatarCache(storage: Pick<Storage, "removeItem">) {
  try {
    storage.removeItem(ADMIN_INGEST_AVATAR_CACHE_KEY);
  } catch {
    // The permanent server profile remains the source of truth.
  }
}

export function writeAdminIngestAvatarCache(
  storage: AvatarCacheStorage,
  avatarUrl: string
) {
  const normalizedAvatarUrl = avatarUrl.trim();

  if (!normalizedAvatarUrl) {
    clearAdminIngestAvatarCache(storage);
    return false;
  }

  try {
    const previousValue = storage.getItem(ADMIN_INGEST_AVATAR_CACHE_KEY)?.trim() ?? "";

    if (previousValue && isLegacyAvatarCacheValue(previousValue)) {
      storage.removeItem(ADMIN_INGEST_AVATAR_CACHE_KEY);
    }

    storage.setItem(ADMIN_INGEST_AVATAR_CACHE_KEY, normalizedAvatarUrl);
    return true;
  } catch {
    // A legacy Base64 avatar can exhaust localStorage. Remove only this
    // deprecated cache entry and retry the small permanent URL once.
    clearAdminIngestAvatarCache(storage);

    try {
      storage.setItem(ADMIN_INGEST_AVATAR_CACHE_KEY, normalizedAvatarUrl);
      return true;
    } catch {
      // Browser storage can be unavailable or full. The server copy is already
      // permanent, so cache failure must never turn a successful save into an error.
      return false;
    }
  }
}

async function readProfileResponse(response: Response) {
  const payload = await response.json().catch(() => null) as ApiEnvelope<AdminIngestAccountProfileResponse> | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(
      payload?.message
      || payload?.error?.message
      || `账号资料保存失败（HTTP ${response.status}）。`
    );
  }

  return payload.data;
}

export async function loadAdminIngestAccountProfile(signal?: AbortSignal) {
  const response = await fetch("/api/admin/ingest-profile", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    signal
  });

  return readProfileResponse(response);
}

export async function saveAdminIngestAccountName(name: string) {
  const response = await fetch("/api/admin/ingest-profile", {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name })
  });

  return readProfileResponse(response);
}

export async function saveAdminIngestAccountAvatar(file: File) {
  const formData = new FormData();
  formData.set("avatar", file);

  const response = await fetch("/api/admin/ingest-profile", {
    method: "POST",
    credentials: "include",
    body: formData
  });

  return readProfileResponse(response);
}

export async function legacyAdminIngestAvatarToFile(value: string) {
  const source = value.trim();

  if (!source.startsWith("data:image/") && !source.startsWith("blob:")) {
    return null;
  }

  const response = await fetch(source);
  const blob = await response.blob();

  if (!blob.type.startsWith("image/") || blob.size <= 0) {
    return null;
  }

  const extension = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return new File([blob], `legacy-admin-avatar.${extension}`, { type: blob.type });
}
