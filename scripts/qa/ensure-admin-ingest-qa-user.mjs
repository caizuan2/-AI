#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { tsImport } from "tsx/esm/api";

const { assertLocalQaDatabaseOrThrow, describeQaDatabaseUrl } = await tsImport(
  "../../lib/config/qa-mode.ts",
  import.meta.url
);
const QA_LOGIN_PHONE = "13920260601";
const QA_STORED_PHONE = "+8613920260601";
const QA_DISPLAY_NAME = "qa_ingest_admin_202606";
const QA_PASSWORD = "Qa12345678!";
const QA_ROLE = "ingest_admin";
const QA_METADATA = {
  qaLocalOnly: true,
  createdBy: "worktree2-local-validation",
  source: "scripts/qa/ensure-admin-ingest-qa-user.mjs"
};
const PASSWORD_SALT_ROUNDS = 12;

async function hashQaPassword(password) {
  try {
    const { hashPassword } = await tsImport(
      "../../lib/auth/password.ts",
      import.meta.url
    );

    return hashPassword(password);
  } catch {
    return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
  }
}

assertLocalQaDatabaseOrThrow();

const prisma = new PrismaClient();

async function ensureRoleAssignment(userId) {
  const existing = await prisma.userRoleAssignment.findFirst({
    where: {
      userId,
      role: QA_ROLE,
      revokedAt: null
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (existing) {
    await prisma.userRoleAssignment.update({
      where: { id: existing.id },
      data: {
        expiresAt: null
      }
    });
    return existing.id;
  }

  const created = await prisma.userRoleAssignment.create({
    data: {
      userId,
      role: QA_ROLE,
      expiresAt: null
    }
  });

  return created.id;
}

async function recordQaAudit(userId, targetId, action) {
  await prisma.auditLog.create({
    data: {
      userId,
      role: QA_ROLE,
      action,
      targetType: "qa_admin_ingest_user",
      targetId,
      metadata: QA_METADATA
    }
  });
}

async function main() {
  const passwordHash = await hashQaPassword(QA_PASSWORD);
  const existing = await prisma.user.findUnique({
    where: { phone: QA_STORED_PHONE },
    select: { id: true }
  });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: QA_DISPLAY_NAME,
          passwordHash,
          isActive: true,
          licenseActivated: true,
          role: QA_ROLE
        },
        select: {
          id: true,
          phone: true,
          name: true,
          role: true,
          isActive: true,
          licenseActivated: true
        }
      })
    : await prisma.user.create({
        data: {
          phone: QA_STORED_PHONE,
          name: QA_DISPLAY_NAME,
          passwordHash,
          isActive: true,
          licenseActivated: true,
          role: QA_ROLE
        },
        select: {
          id: true,
          phone: true,
          name: true,
          role: true,
          isActive: true,
          licenseActivated: true
        }
      });

  const assignmentId = await ensureRoleAssignment(user.id);
  await recordQaAudit(user.id, assignmentId, existing ? "qa_admin_ingest_user_update" : "qa_admin_ingest_user_create");

  const db = describeQaDatabaseUrl(process.env.DATABASE_URL);

  console.log("QA_USER_READY");
  console.log(`username: ${QA_LOGIN_PHONE}`);
  console.log(`phone: ${QA_LOGIN_PHONE}`);
  console.log(`displayName: ${QA_DISPLAY_NAME}`);
  console.log("password: ******");
  console.log(`role: ${user.role}`);
  console.log(`roles: user,${QA_ROLE}`);
  console.log(`isActive: ${user.isActive}`);
  console.log(`licenseActivated: ${user.licenseActivated}`);
  console.log("hasIngestAccess expected: true");
  console.log(`databaseHost: ${db.host}`);
  console.log(`databaseName: ${db.database}`);
  console.log(`localOnly: ${db.isLocalQaDatabase}`);
}

main()
  .catch((error) => {
    console.error("QA_USER_FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
