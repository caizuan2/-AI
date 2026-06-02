import "server-only";

import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants";
import { ConfigError, ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { hasSessionSecret } from "@/lib/server-config-core";

export interface CurrentUser {
  id: string;
  email: string | null;
  phone: string;
  name: string;
}

export interface AppUser extends CurrentUser {
  isActive: boolean;
  licenseActivated: boolean;
}

export function hashSessionToken(token: string) {
  const secret = process.env.SESSION_SECRET?.trim();

  if (!secret) {
    throw new ConfigError("认证密钥未配置，请在 Netlify 设置 SESSION_SECRET。");
  }

  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

function getSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_MAX_AGE_SECONDS
  };
}

function toAppUser(user: {
  id: string;
  email: string | null;
  phone: string;
  name: string | null;
  isActive: boolean;
  licenseActivated: boolean;
}): AppUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name?.trim() || user.phone || user.email || user.id,
    isActive: user.isActive,
    licenseActivated: user.licenseActivated
  };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt
    }
  });

  cookies().set(SESSION_COOKIE_NAME, token, getSessionCookieOptions(expiresAt));

  return { token, expiresAt };
}

export async function getCurrentUser(): Promise<AppUser> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    throw new UnauthorizedError("请先登录后再继续。");
  }

  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          phone: true,
          name: true,
          isActive: true,
          licenseActivated: true
        }
      }
    }
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.session.deleteMany({ where: { id: session.id } });
    }

    throw new UnauthorizedError("登录状态已过期，请重新登录。");
  }

  if (!session.user.isActive) {
    throw new ForbiddenError("账号已禁用。");
  }

  return toAppUser(session.user);
}

export async function requireUser() {
  return getCurrentUser();
}

export async function destroySession() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;

  if (token && hasSessionSecret()) {
    await prisma.session.deleteMany({
      where: {
        tokenHash: hashSessionToken(token)
      }
    });
  }

  cookies().set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}
