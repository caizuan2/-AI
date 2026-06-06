import { requireAdminUser } from "@/lib/admin";
import { apiError, apiSuccess } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

interface DebugEnvResponse {
  database_type: "postgresql" | "missing";
  database_url_masked: string;
  api_base_url: string;
  node_env: string;
  license_secret_set: boolean;
  session_secret_fallback_set: boolean;
}

function maskDatabaseUrl(value?: string) {
  if (!value) {
    return "missing";
  }

  try {
    const url = new URL(value);
    if (url.password) {
      url.password = "****";
    }
    if (url.username) {
      url.username = `${url.username.slice(0, 8)}...`;
    }
    return url.toString();
  } catch {
    return "configured-but-unparseable";
  }
}

export async function GET(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminUser>>;

  try {
    admin = await requireAdminUser(request);
  } catch (error) {
    return apiError(error);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();

  await writeAuditLog({
    userId: admin.id,
    role: admin.role,
    action: "ADMIN_DEBUG_ENV_VIEW",
    targetType: "admin_debug",
    request
  });

  return apiSuccess<DebugEnvResponse>({
    database_type: databaseUrl ? "postgresql" : "missing",
    database_url_masked: maskDatabaseUrl(databaseUrl),
    api_base_url: process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "same-origin /api",
    node_env: process.env.NODE_ENV || "development",
    license_secret_set: Boolean(process.env.LICENSE_SECRET?.trim()),
    session_secret_fallback_set: Boolean(process.env.SESSION_SECRET?.trim())
  });
}
