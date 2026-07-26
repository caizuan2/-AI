import "server-only";

import { LicenseKeyStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getAcceptedLicenseHashes,
  getLicenseAppTypeFromKey,
  hashLicenseKey,
  isSupportedLicenseKeyInput,
  normalizeLicenseAppType,
  normalizeLicenseKey,
  redeemLicenseKey,
  type LicenseActivationContext,
  type LicenseAppType
} from "@/lib/auth/license";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  ForbiddenError,
  InvalidLicenseKeyError,
  LicenseActivationLimitReachedError,
  LicenseAppTypeMismatchError,
  LicenseDisabledError,
  LicenseExpiredError,
  LicenseNotFoundError,
  LicenseRequiredError,
  UnauthorizedError,
  ValidationError
} from "@/lib/errors";

const USER_LICENSE_APP_TYPE: LicenseAppType = "user_app";
const USER_ENTRY_TRANSACTION_MAX_WAIT_MS = 15_000;
const USER_ENTRY_TRANSACTION_TIMEOUT_MS = 10_000;
const LICENSE_METADATA_ACTIONS = [
  "generate_user_app_license_key",
  "generate_ingest_admin_license_key",
  "generate_super_admin_license_key",
  "redeem_license_key",
  "redeem_license_key_idempotent",
  "SUPER_ADMIN_LICENSE_GENERATE"
];

const userEntrySelect = {
  id: true,
  phone: true,
  name: true,
  passwordHash: true,
  isActive: true,
  licenseActivated: true,
  role: true
} satisfies Prisma.UserSelect;

export type UserEntryRecord = Prisma.UserGetPayload<{ select: typeof userEntrySelect }>;

export type UserEntryMode = "login" | "created" | "reactivated";

export type UserEntryResult = {
  mode: UserEntryMode;
  user: {
    id: string;
    phone: string;
    name: string;
    isActive: boolean;
    licenseActivated: boolean;
  };
};

export type UserEntryInput = {
  phone: string;
  password: string;
  name?: string;
  licenseKey?: string;
  context?: LicenseActivationContext;
};

export type UserEntryLicenseRecord = {
  id: string;
  status: LicenseKeyStatus;
  redeemedByUserId: string | null;
  expiresAt: Date | null;
  appType: LicenseAppType;
};

type UserEntryReadClient = Pick<Prisma.TransactionClient, "auditLog" | "licenseKey">;
export type UserLicenseState = "active" | "disabled" | "expired" | "missing";

export type UserLicenseReactivationCommitInput = {
  userId: string;
  userRole: UserEntryRecord["role"];
  replacementLicenseId: string;
  replacementLicenseCodeHash: string;
  previousLicenseState: "disabled" | "expired";
  nextPasswordHash: string | null;
  activatedAt: Date;
  context?: LicenseActivationContext;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readMetadataAppType(metadata: unknown): LicenseAppType | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const value = metadata.appType ??
    metadata.requestedAppType ??
    metadata.licenseAppType ??
    metadata.product ??
    metadata.cardType ??
    metadata.licenseType;

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return normalizeLicenseAppType(value);
}

async function getLicenseAppType(
  licenseId: string,
  fallback: LicenseAppType,
  db: UserEntryReadClient = prisma
) {
  const auditLogs = await db.auditLog.findMany({
    where: {
      targetType: "license_key",
      targetId: licenseId,
      action: {
        in: LICENSE_METADATA_ACTIONS
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      metadata: true
    },
    take: 10
  });

  for (const auditLog of auditLogs) {
    const appType = readMetadataAppType(auditLog.metadata);

    if (appType) {
      return appType;
    }
  }

  return fallback;
}

async function getUserLicenseState(
  user: UserEntryRecord,
  db: UserEntryReadClient = prisma
) {
  const licenses = await db.licenseKey.findMany({
    where: {
      redeemedByUserId: user.id
    },
    orderBy: [
      { redeemedAt: "desc" },
      { createdAt: "desc" }
    ],
    select: {
      id: true,
      status: true,
      redeemedByUserId: true,
      expiresAt: true
    }
  });

  const typedLicenses: UserEntryLicenseRecord[] = await Promise.all(
    licenses.map(async (license) => ({
      ...license,
      appType: await getLicenseAppType(license.id, USER_LICENSE_APP_TYPE, db)
    }))
  );
  const userLicenses = typedLicenses.filter((license) => license.appType === USER_LICENSE_APP_TYPE);
  const now = new Date();

  if (userLicenses.some(
    (license) => license.status === LicenseKeyStatus.USED && (!license.expiresAt || license.expiresAt > now)
  )) {
    return "active" as const;
  }

  if (userLicenses.some((license) => license.status === LicenseKeyStatus.DISABLED)) {
    return "disabled" as const;
  }

  if (userLicenses.some(
    (license) => license.status === LicenseKeyStatus.USED && Boolean(license.expiresAt && license.expiresAt <= now)
  )) {
    return "expired" as const;
  }

  if (typedLicenses.length === 0 && user.licenseActivated && user.role === "user") {
    return "active" as const;
  }

  return "missing" as const;
}

export function assertUserLicenseReactivationAllowed(
  licenseState: UserLicenseState
): asserts licenseState is "disabled" | "expired" {
  if (licenseState === "active") {
    throw new ValidationError("当前账号仍在有效期内，请返回普通登录。");
  }

  if (licenseState !== "disabled" && licenseState !== "expired") {
    throw new ValidationError("当前账号不符合换卡恢复条件。");
  }
}

export function resolveRedeemableUserLicense(
  licenses: UserEntryLicenseRecord[],
  now = new Date()
) {
  const userLicenses = licenses.filter((license) => license.appType === USER_LICENSE_APP_TYPE);

  if (userLicenses.length === 0) {
    throw new LicenseAppTypeMismatchError("卡密不适用于用户端。");
  }

  const availableLicense = userLicenses.find(
    (license) => license.status === LicenseKeyStatus.UNUSED &&
      license.redeemedByUserId === null &&
      (!license.expiresAt || license.expiresAt > now)
  );

  if (availableLicense) {
    return availableLicense;
  }

  if (userLicenses.some((license) => license.status === LicenseKeyStatus.DISABLED)) {
    throw new LicenseDisabledError("卡密已禁用。");
  }

  if (userLicenses.some((license) => Boolean(license.expiresAt && license.expiresAt <= now))) {
    throw new LicenseExpiredError("卡密已过期。");
  }

  throw new LicenseActivationLimitReachedError("卡密已使用。");
}

async function getRedeemableUserLicense(
  key: string,
  db: UserEntryReadClient = prisma
) {
  const normalizedKey = normalizeLicenseKey(key);

  if (!isSupportedLicenseKeyInput(normalizedKey)) {
    throw new InvalidLicenseKeyError("卡密格式无效。");
  }

  if (getLicenseAppTypeFromKey(normalizedKey) !== USER_LICENSE_APP_TYPE) {
    throw new LicenseAppTypeMismatchError("用户端只能使用 XT-USER 卡密。");
  }

  const licenses = await db.licenseKey.findMany({
    where: {
      keyHash: {
        in: getAcceptedLicenseHashes(normalizedKey)
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      id: true,
      status: true,
      redeemedByUserId: true,
      expiresAt: true
    }
  });

  if (licenses.length === 0) {
    throw new LicenseNotFoundError("卡密不存在。");
  }

  const typedLicenses: UserEntryLicenseRecord[] = await Promise.all(
    licenses.map(async (license) => ({
      ...license,
      appType: await getLicenseAppType(license.id, USER_LICENSE_APP_TYPE, db)
    }))
  );
  const availableLicense = resolveRedeemableUserLicense(typedLicenses);

  return {
    ...availableLicense,
    normalizedKey,
    codeHash: hashLicenseKey(normalizedKey)
  };
}

function toResultUser(user: UserEntryRecord): UserEntryResult["user"] {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name?.trim() || user.phone,
    isActive: user.isActive,
    licenseActivated: user.licenseActivated
  };
}

function isUniqueConstraintError(error: unknown) {
  return isRecord(error) && error.code === "P2002";
}

export async function commitUserLicenseReactivation(
  tx: Prisma.TransactionClient,
  input: UserLicenseReactivationCommitInput
) {
  const claimedLicense = await tx.licenseKey.updateMany({
    where: {
      id: input.replacementLicenseId,
      status: LicenseKeyStatus.UNUSED,
      redeemedByUserId: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: input.activatedAt } }
      ]
    },
    data: {
      status: LicenseKeyStatus.USED,
      redeemedByUserId: input.userId,
      redeemedAt: input.activatedAt
    }
  });

  if (claimedLicense.count !== 1) {
    throw new LicenseActivationLimitReachedError("卡密已使用。");
  }

  const updatedUser = await tx.user.updateMany({
    where: {
      id: input.userId,
      isActive: true,
      role: "user"
    },
    data: {
      licenseActivated: true,
      ...(input.nextPasswordHash ? { passwordHash: input.nextPasswordHash } : {})
    }
  });

  if (updatedUser.count !== 1) {
    throw new ForbiddenError("账号已禁用，请联系管理员处理。");
  }

  await tx.activationLog.create({
    data: {
      codeHash: input.replacementLicenseCodeHash,
      userId: input.userId,
      success: true,
      message: "用户端换卡恢复成功。",
      ip: input.context?.ip,
      userAgent: input.context?.userAgent
    }
  });
  await tx.auditLog.create({
    data: {
      userId: input.userId,
      role: input.userRole,
      action: "redeem_license_key",
      targetType: "license_key",
      targetId: input.replacementLicenseId,
      ip: input.context?.ip,
      userAgent: input.context?.userAgent,
      metadata: {
        requestedAppType: USER_LICENSE_APP_TYPE,
        licenseAppType: USER_LICENSE_APP_TYPE,
        source: "user_entry_passwordless_reactivation",
        previousLicenseState: input.previousLicenseState,
        passwordUpdated: Boolean(input.nextPasswordHash),
        activationCount: 1
      }
    }
  });

  return tx.user.findUnique({
    where: {
      id: input.userId
    },
    select: userEntrySelect
  });
}

async function reactivateExistingUserWithLicense(
  user: UserEntryRecord,
  password: string,
  licenseKey: string,
  context?: LicenseActivationContext
): Promise<UserEntryResult> {
  const nextPasswordHash = password ? await hashPassword(password) : null;
  const activatedUser = await prisma.$transaction(
    async (tx) => {
      const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${user.id} FOR UPDATE`
      );

      if (lockedUsers.length !== 1) {
        throw new ForbiddenError("账号不存在或已停用，无法换卡恢复。");
      }

      const lockedUser = await tx.user.findUnique({
        where: {
          id: user.id
        },
        select: userEntrySelect
      });

      if (!lockedUser || !lockedUser.isActive) {
        throw new ForbiddenError("账号已禁用，请联系管理员处理。");
      }

      if (lockedUser.role !== "user") {
        throw new ForbiddenError("该账号不属于用户端，请从对应管理端登录。");
      }

      const lockedLicenseState = await getUserLicenseState(lockedUser, tx);
      assertUserLicenseReactivationAllowed(lockedLicenseState);

      const redeemableLicense = await getRedeemableUserLicense(licenseKey, tx);
      const activatedAt = new Date();
      return commitUserLicenseReactivation(tx, {
        userId: lockedUser.id,
        userRole: lockedUser.role,
        replacementLicenseId: redeemableLicense.id,
        replacementLicenseCodeHash: redeemableLicense.codeHash,
        previousLicenseState: lockedLicenseState,
        nextPasswordHash,
        activatedAt,
        context
      });
    },
    {
      maxWait: USER_ENTRY_TRANSACTION_MAX_WAIT_MS,
      timeout: USER_ENTRY_TRANSACTION_TIMEOUT_MS
    }
  );

  if (!activatedUser) {
    throw new ForbiddenError("账号不存在或已停用，无法换卡恢复。");
  }

  return {
    mode: "reactivated",
    user: toResultUser(activatedUser)
  };
}

async function enterExistingUser(
  user: UserEntryRecord,
  password: string,
  licenseKey: string,
  context?: LicenseActivationContext
): Promise<UserEntryResult> {
  if (!user.isActive) {
    throw new ForbiddenError("账号已禁用，请联系管理员处理。");
  }

  if (user.role !== "user") {
    throw new ForbiddenError("该账号不属于用户端，请从对应管理端登录。");
  }

  const licenseState = await getUserLicenseState(user);

  if (licenseState === "active") {
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedError("手机号或密码错误。");
    }

    return {
      mode: "login",
      user: toResultUser(user)
    };
  }

  if (!licenseKey) {
    throw new LicenseRequiredError(
      licenseState === "expired"
        ? "当前卡密已过期，请输入新的有效用户端卡密。"
        : licenseState === "disabled"
          ? "当前卡密已禁用，请输入新的有效用户端卡密。"
          : "首次使用或账号尚未激活，请输入有效用户端卡密。"
    );
  }

  if (licenseState === "disabled" || licenseState === "expired") {
    return reactivateExistingUserWithLicense(user, password, licenseKey, context);
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new UnauthorizedError("手机号或密码错误。");
  }

  const redeemableLicense = await getRedeemableUserLicense(licenseKey);
  await redeemLicenseKey(user.id, redeemableLicense.normalizedKey, {
    ...context,
    appType: USER_LICENSE_APP_TYPE
  });

  const activatedUser = await prisma.user.findUnique({
    where: {
      id: user.id
    },
    select: userEntrySelect
  });

  if (!activatedUser || await getUserLicenseState(activatedUser) !== "active") {
    throw new LicenseRequiredError("卡密激活未完成，请重新输入有效卡密。");
  }

  return {
    mode: "reactivated",
    user: toResultUser(activatedUser)
  };
}

async function createUserWithLicense(input: UserEntryInput): Promise<UserEntryResult> {
  const name = input.name?.trim() || "";

  if (input.password.length < 8) {
    throw new ValidationError("首次使用时密码至少需要 8 位。");
  }

  if (!input.licenseKey) {
    throw new LicenseRequiredError("首次使用请输入有效用户端卡密。");
  }

  if (!name) {
    throw new ValidationError(
      "这是新手机号，首次开户请填写网名；如需恢复已禁用或过期卡密的原账号，请使用原手机号和一张新的未使用卡密。"
    );
  }

  if (name.length > 50) {
    throw new ValidationError("网名不能超过 50 个字符。");
  }

  const license = await getRedeemableUserLicense(input.licenseKey);
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  try {
    const createdUser = await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            phone: input.phone,
            passwordHash,
            name,
            isActive: true,
            licenseActivated: true,
            role: "user"
          },
          select: userEntrySelect
        });
        const claimedLicense = await tx.licenseKey.updateMany({
          where: {
            id: license.id,
            status: LicenseKeyStatus.UNUSED,
            redeemedByUserId: null,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } }
            ]
          },
          data: {
            status: LicenseKeyStatus.USED,
            redeemedByUserId: user.id,
            redeemedAt: now
          }
        });

        if (claimedLicense.count !== 1) {
          throw new LicenseActivationLimitReachedError("卡密已使用。");
        }

        await tx.activationLog.create({
          data: {
            codeHash: license.codeHash,
            userId: user.id,
            success: true,
            message: "首次登录自动激活成功。",
            ip: input.context?.ip,
            userAgent: input.context?.userAgent
          }
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            role: null,
            action: "redeem_license_key",
            targetType: "license_key",
            targetId: license.id,
            ip: input.context?.ip,
            userAgent: input.context?.userAgent,
            metadata: {
              requestedAppType: USER_LICENSE_APP_TYPE,
              licenseAppType: USER_LICENSE_APP_TYPE,
              source: "user_entry_auto_create",
              activationCount: 1
            }
          }
        });

        return user;
      },
      {
        maxWait: USER_ENTRY_TRANSACTION_MAX_WAIT_MS,
        timeout: USER_ENTRY_TRANSACTION_TIMEOUT_MS
      }
    );

    return {
      mode: "created",
      user: toResultUser(createdUser)
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        phone: input.phone
      },
      select: userEntrySelect
    });

    if (!existingUser) {
      throw error;
    }

    return enterExistingUser(existingUser, input.password, input.licenseKey, input.context);
  }
}

export async function enterUserApp(input: UserEntryInput): Promise<UserEntryResult> {
  const licenseKey = input.licenseKey?.trim() || "";
  const existingUser = await prisma.user.findUnique({
    where: {
      phone: input.phone
    },
    select: userEntrySelect
  });

  if (existingUser) {
    return enterExistingUser(existingUser, input.password, licenseKey, input.context);
  }

  return createUserWithLicense({
    ...input,
    licenseKey
  });
}
