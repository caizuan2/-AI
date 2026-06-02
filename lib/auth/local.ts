export const LOCAL_AUTH_COOKIE_NAME = "ai_kb_local_auth";
export const LOCAL_AUTH_DEFAULT_EMAIL = "local-dev@ai-knowledge-base.local";
export const LOCAL_AUTH_DEFAULT_NAME = "本地开发用户";
export const LOCAL_AUTH_DEFAULT_PASSWORD = "local-password";

export interface LocalAuthUser {
  id: string;
  email: string;
  name: string;
}

export function isLocalAuthAllowedHost(host: string | null | undefined) {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const rawHost = (host ?? "").trim().toLowerCase();
  const hostname = rawHost.split(":")[0]?.replace(/^\[|\]$/g, "");

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function createLocalUser(email: string, name?: string): LocalAuthUser {
  const normalizedEmail = email.trim().toLowerCase();
  const safeId = normalizedEmail.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  return {
    id: `local-${safeId || "dev-user"}`,
    email: normalizedEmail,
    name: name?.trim() || normalizedEmail.split("@")[0] || LOCAL_AUTH_DEFAULT_NAME
  };
}

export function createLocalAuthCookieValue(user: LocalAuthUser) {
  return encodeURIComponent(JSON.stringify(user));
}

export function readLocalAuthCookie(value: string | undefined): LocalAuthUser | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<LocalAuthUser>;

    if (!parsed.id || !parsed.email || !parsed.name) {
      return null;
    }

    return {
      id: parsed.id,
      email: parsed.email,
      name: parsed.name
    };
  } catch {
    return null;
  }
}

export const localAuthCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30
};
