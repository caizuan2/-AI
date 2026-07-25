"use client";

export type AdminIngestPasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  message?: string;
  error?: {
    message?: string;
  };
};

export async function changeAdminIngestAccountPassword(
  input: AdminIngestPasswordChangeInput
) {
  const response = await fetch("/api/ingest/auth/change-password", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      confirmPassword: input.confirmPassword
    })
  });
  const payload = await response.json().catch(() => null) as ApiEnvelope<{
    changed: true;
    sessionsRevoked: true;
  }> | null;

  if (!response.ok || !payload?.ok || !payload.data?.changed) {
    throw new Error(
      payload?.message
      || payload?.error?.message
      || `密码修改失败（HTTP ${response.status}）。`
    );
  }

  return payload.data;
}
