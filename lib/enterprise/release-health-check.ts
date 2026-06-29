import "server-only";

import type { ReleaseHealthTarget, ReleaseStatus } from "@/lib/enterprise/release-console-types";

const HEALTH_TARGETS = [
  { key: "login", path: "/ingest/login?app=ingest-admin&next=/admin-ingest" },
  { key: "admin-ingest", path: "/admin-ingest?app=ingest-admin&platform=web" },
  { key: "chat-ui", path: "/chat-ui?app=user&platform=web" },
  { key: "ingest-auth-me", path: "/api/ingest/auth/me" },
  { key: "expert-market", path: "/api/public/expert-market" }
];

export function statusFromHttp(status: number | "error" | "unknown"): ReleaseStatus {
  if (status === "unknown") {
    return "unknown";
  }
  if (status === "error") {
    return "error";
  }
  if (status >= 200 && status < 400) {
    return "success";
  }
  if (status === 401 || status === 403 || status === 404) {
    return "warning";
  }
  return "error";
}

export async function checkReleaseHealth(baseUrl: string, cookieHeader?: string | null): Promise<ReleaseHealthTarget[]> {
  const origin = baseUrl.replace(/\/$/, "");

  return Promise.all(HEALTH_TARGETS.map(async (target) => {
    try {
      const response = await fetch(`${origin}${target.path}`, {
        method: "HEAD",
        cache: "no-store",
        redirect: "manual",
        headers: cookieHeader ? { cookie: cookieHeader } : undefined
      });

      return {
        ...target,
        status: response.status,
        ok: response.status >= 200 && response.status < 400
      };
    } catch (error) {
      return {
        ...target,
        status: "error" as const,
        ok: false,
        message: error instanceof Error ? error.message : "health check failed"
      };
    }
  }));
}
