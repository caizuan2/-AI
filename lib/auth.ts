import "server-only";

import type { User as SupabaseUser } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getPhoneDisplay } from "@/lib/auth/phone";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { UnauthorizedError } from "@/lib/errors";

export interface CurrentUser {
  id: string;
  email: string | null;
  phone: string | null;
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

  return getPhoneDisplay(user.phone, user.email);
}

function toCurrentUserIdentity(user: SupabaseUser): CurrentUser {
  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    name: getDisplayName(user)
  };
}

export async function getCurrentAuthUser(): Promise<CurrentUser> {
  if (!hasSupabaseConfig()) {
    throw new UnauthorizedError("认证服务未配置，请先设置 Supabase 环境变量。");
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
  const email = user.email?.trim() || null;
  const phone = user.phone?.trim() || null;
  const select = {
    id: true,
    email: true,
    phone: true,
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
        email,
        phone,
        name: user.name
      },
      select
    });
  }

  const existingByEmail = email
    ? await prisma.user.findUnique({
      where: { email },
      select
    })
    : null;

  if (existingByEmail) {
    return prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        id: user.id,
        phone,
        name: user.name
      },
      select
    });
  }

  const existingByPhone = phone
    ? await prisma.user.findUnique({
      where: { phone },
      select
    })
    : null;

  if (existingByPhone) {
    return prisma.user.update({
      where: { id: existingByPhone.id },
      data: {
        id: user.id,
        email,
        name: user.name
      },
      select
    });
  }

  const appUser = await prisma.user.create({
    data: {
      id: user.id,
      email,
      phone,
      name: user.name
    },
    select
  });

  return appUser;
}

export async function getCurrentUser(): Promise<AppUser> {
  return ensureAppUser(await getCurrentAuthUser());
}
