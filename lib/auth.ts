import "server-only";

import type { User as SupabaseUser } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { isLocalAuthAllowedHost, LOCAL_AUTH_COOKIE_NAME, readLocalAuthCookie } from "@/lib/auth/local";
import { UnauthorizedError } from "@/lib/errors";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
}

export interface AppUser extends CurrentUser {
  betaAccess: boolean;
  betaRequestedAt: Date | null;
}

function getMetadataValue(user: SupabaseUser, key: string) {
  const value = user.user_metadata?.[key];

  return typeof value === "string" ? value.trim() : "";
}

function getDisplayName(user: SupabaseUser) {
  const metadataName = getMetadataValue(user, "name") || getMetadataValue(user, "full_name");

  if (metadataName) {
    return metadataName;
  }

  return user.email?.split("@")[0] || "知识库用户";
}

function toCurrentUserIdentity(user: SupabaseUser): CurrentUser {
  if (!user.email) {
    throw new UnauthorizedError("当前账号缺少邮箱，无法继续。");
  }

  return {
    id: user.id,
    email: user.email,
    name: getDisplayName(user)
  };
}

export async function getCurrentAuthUser(): Promise<CurrentUser> {
  if (!hasSupabaseConfig()) {
    const host = headers().get("host");

    if (!isLocalAuthAllowedHost(host)) {
      throw new UnauthorizedError("认证服务未配置，请先设置 Supabase 环境变量。");
    }

    const localUser = readLocalAuthCookie(cookies().get(LOCAL_AUTH_COOKIE_NAME)?.value);

    if (!localUser) {
      throw new UnauthorizedError("请先登录后再继续。");
    }

    return localUser;
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new UnauthorizedError("请先登录后再继续。");
  }

  return toCurrentUserIdentity(user);
}

export async function ensureAppUser(user: CurrentUser): Promise<AppUser> {
  const select = {
    id: true,
    email: true,
    name: true,
    betaAccess: true,
    betaRequestedAt: true
  } as const;
  const existingById = await prisma.user.findUnique({
    where: { id: user.id },
    select
  });

  if (existingById) {
    return prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.email,
        name: user.name
      },
      select
    });
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email: user.email },
    select
  });

  if (existingByEmail) {
    return prisma.user.update({
      where: { email: user.email },
      data: {
        id: user.id,
        name: user.name
      },
      select
    });
  }

  const appUser = await prisma.user.create({
    data: {
      id: user.id,
      email: user.email,
      name: user.name
    },
    select
  });

  return appUser;
}

export async function getCurrentUser(): Promise<AppUser> {
  return ensureAppUser(await getCurrentAuthUser());
}
