import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import { checkRegistrationSchema } from "@/lib/db/registration-schema";
import { AppError } from "@/lib/errors";
import type {
  TeamOsRegisterInput,
  TeamOsRegisterResult
} from "@/apps/team-os/features/onboarding/types";

export async function registerTeamOsAccount(
  input: TeamOsRegisterInput,
  request: Request
): Promise<TeamOsRegisterResult> {
  const schema = await checkRegistrationSchema();
  if (!schema.ready) {
    throw new AppError("DATABASE_SCHEMA_MISSING", "注册所需数据库结构尚未就绪，请联系管理员。", 500);
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: input.phone },
        { email: { equals: input.email, mode: "insensitive" } }
      ]
    },
    select: { phone: true, email: true }
  });
  if (existing) {
    throw new AppError("VALIDATION_ERROR", "手机号或邮箱已注册，请直接登录 AI Team OS。", 409);
  }

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        phone: input.phone,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        isActive: true,
        licenseActivated: false
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true
      }
    });

    await createSession(user.id, request);

    return {
      user: {
        id: user.id,
        name: user.name?.trim() || user.phone,
        phone: user.phone,
        email: user.email ?? input.email
      },
      nextPath: "/team-os/activate"
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("VALIDATION_ERROR", "手机号或邮箱已注册，请直接登录 AI Team OS。", 409);
    }
    throw error;
  }
}
