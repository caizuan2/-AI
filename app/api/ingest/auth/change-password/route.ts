import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { resolveSessionCookieSecure } from "@/lib/auth/session-cookie";
import { apiError, apiSuccess } from "@/lib/api-response";
import { UnauthorizedError, ValidationError } from "@/lib/errors";
import { requireAdminIngestChatAccess } from "@/lib/enterprise/admin-ingest-auth";
import { parseIngestChangePasswordRequest } from "@/lib/enterprise/ingest-auth-credentials";
import { INGEST_PORTAL_COOKIE_NAME } from "@/lib/enterprise/ingest-portal-cookie";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let access: Awaited<ReturnType<typeof requireAdminIngestChatAccess>>;

  try {
    access = await requireAdminIngestChatAccess();
  } catch (error) {
    return apiError(error);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: ReturnType<typeof parseIngestChangePasswordRequest>;

  try {
    input = parseIngestChangePasswordRequest(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const current = await prisma.user.findUnique({
      where: {
        id: access.actor.id
      },
      select: {
        passwordHash: true
      }
    });

    if (!current || !(await verifyPassword(input.currentPassword, current.passwordHash))) {
      throw new UnauthorizedError("当前密码不正确。");
    }

    const passwordHash = await hashPassword(input.newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: {
          id: access.actor.id
        },
        data: {
          passwordHash
        }
      }),
      prisma.session.deleteMany({
        where: {
          userId: access.actor.id
        }
      })
    ]);

    const response = apiSuccess({
      changed: true,
      sessionsRevoked: true
    });
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: resolveSessionCookieSecure(request),
      path: "/",
      maxAge: 0
    };

    response.cookies.set(SESSION_COOKIE_NAME, "", cookieOptions);
    response.cookies.set(INGEST_PORTAL_COOKIE_NAME, "", cookieOptions);

    return response;
  } catch (error) {
    return apiError(error);
  }
}
