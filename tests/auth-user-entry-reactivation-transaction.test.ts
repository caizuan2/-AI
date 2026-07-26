import assert from "node:assert/strict";
import test from "node:test";
import { LicenseKeyStatus, type Prisma } from "@prisma/client";
import {
  assertUserLicenseReactivationAllowed,
  commitUserLicenseReactivation,
  resolveRedeemableUserLicense,
  type UserLicenseReactivationCommitInput
} from "../lib/auth/user-entry";
import {
  LicenseActivationLimitReachedError,
  LicenseAppTypeMismatchError,
  LicenseDisabledError,
  LicenseExpiredError,
  ValidationError
} from "../lib/errors";

type FakeUser = {
  id: string;
  phone: string;
  name: string;
  passwordHash: string;
  isActive: boolean;
  licenseActivated: boolean;
  role: "user";
};

type FakeLicense = {
  id: string;
  status: LicenseKeyStatus;
  redeemedByUserId: string | null;
  redeemedAt: Date | null;
  expiresAt: Date | null;
};

type FakeState = {
  users: FakeUser[];
  licenses: FakeLicense[];
  activationLogs: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
  sessions: Array<{ id: string; userId: string }>;
  conversations: Array<{ id: string; userId: string }>;
  messages: Array<{ id: string; userId: string; conversationId: string; content: string }>;
  knowledgeItems: Array<{ id: string; userId: string; content: string }>;
};

function createState(oldLicenseStatus: LicenseKeyStatus = LicenseKeyStatus.DISABLED): FakeState {
  const now = Date.now();

  return {
    users: [{
      id: "user-original",
      phone: "13800138000",
      name: "原账号网名",
      passwordHash: "old-password-hash",
      isActive: true,
      licenseActivated: true,
      role: "user"
    }],
    licenses: [
      {
        id: "license-old",
        status: oldLicenseStatus,
        redeemedByUserId: "user-original",
        redeemedAt: new Date(now - 30_000),
        expiresAt: oldLicenseStatus === LicenseKeyStatus.USED
          ? new Date(now - 10_000)
          : new Date(now + 86_400_000)
      },
      {
        id: "license-new",
        status: LicenseKeyStatus.UNUSED,
        redeemedByUserId: null,
        redeemedAt: null,
        expiresAt: new Date(now + 86_400_000)
      }
    ],
    activationLogs: [],
    auditLogs: [],
    sessions: [{ id: "session-existing", userId: "user-original" }],
    conversations: [{ id: "conversation-existing", userId: "user-original" }],
    messages: [{
      id: "message-existing",
      userId: "user-original",
      conversationId: "conversation-existing",
      content: "原聊天记录"
    }],
    knowledgeItems: [{
      id: "knowledge-existing",
      userId: "user-original",
      content: "原知识数据"
    }]
  };
}

function cloneState(state: FakeState) {
  return structuredClone(state);
}

function createFakeTransactionClient(state: FakeState, failAudit = false) {
  return {
    licenseKey: {
      updateMany: async ({ where, data }: {
        where: {
          id: string;
          status: LicenseKeyStatus;
          redeemedByUserId: null;
          OR: Array<{ expiresAt: null } | { expiresAt: { gt: Date } }>;
        };
        data: {
          status: LicenseKeyStatus;
          redeemedByUserId: string;
          redeemedAt: Date;
        };
      }) => {
        const license = state.licenses.find((candidate) => candidate.id === where.id);
        const validAt = data.redeemedAt;
        const canClaim = Boolean(
          license &&
          license.status === where.status &&
          license.redeemedByUserId === where.redeemedByUserId &&
          (!license.expiresAt || license.expiresAt > validAt)
        );

        if (!license || !canClaim) {
          return { count: 0 };
        }

        license.status = data.status;
        license.redeemedByUserId = data.redeemedByUserId;
        license.redeemedAt = data.redeemedAt;
        return { count: 1 };
      }
    },
    user: {
      updateMany: async ({ where, data }: {
        where: { id: string; isActive: true; role: "user" };
        data: { licenseActivated: true; passwordHash?: string };
      }) => {
        const user = state.users.find((candidate) =>
          candidate.id === where.id &&
          candidate.isActive === where.isActive &&
          candidate.role === where.role
        );

        if (!user) {
          return { count: 0 };
        }

        user.licenseActivated = data.licenseActivated;

        if (data.passwordHash) {
          user.passwordHash = data.passwordHash;
        }

        return { count: 1 };
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        return state.users.find((candidate) => candidate.id === where.id) ?? null;
      }
    },
    activationLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.activationLogs.push(structuredClone(data));
        return data;
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (failAudit) {
          throw new Error("simulated audit failure");
        }

        state.auditLogs.push(structuredClone(data));
        return data;
      }
    }
  } as unknown as Prisma.TransactionClient;
}

function createTransactionHarness(initialState: FakeState) {
  let state = cloneState(initialState);
  let queue = Promise.resolve();

  return {
    read: () => cloneState(state),
    transaction: async <T>(
      callback: (tx: Prisma.TransactionClient) => Promise<T>,
      options?: { failAudit?: boolean }
    ) => {
      const previous = queue;
      let releaseQueue: (() => void) | undefined;
      queue = new Promise<void>((resolve) => {
        releaseQueue = resolve;
      });
      await previous;

      const draft = cloneState(state);

      try {
        const result = await callback(
          createFakeTransactionClient(draft, options?.failAudit)
        );
        state = draft;
        return result;
      } finally {
        releaseQueue?.();
      }
    }
  };
}

function createCommitInput(
  previousLicenseState: "disabled" | "expired",
  nextPasswordHash: string | null
): UserLicenseReactivationCommitInput {
  return {
    userId: "user-original",
    userRole: "user",
    replacementLicenseId: "license-new",
    replacementLicenseCodeHash: "new-license-code-hash",
    previousLicenseState,
    nextPasswordHash,
    activatedAt: new Date(),
    context: {
      appType: "user_app",
      ip: "127.0.0.1",
      userAgent: "transaction-test"
    }
  };
}

test("禁用旧卡可用新卡和任意新密码恢复同一账号", async () => {
  assert.doesNotThrow(() => assertUserLicenseReactivationAllowed("disabled"));
  const harness = createTransactionHarness(createState(LicenseKeyStatus.DISABLED));
  const before = harness.read();

  const result = await harness.transaction((tx) =>
    commitUserLicenseReactivation(tx, createCommitInput("disabled", "new-password-hash"))
  );
  const after = harness.read();

  assert.equal(result?.id, "user-original");
  assert.equal(after.users[0]?.passwordHash, "new-password-hash");
  assert.equal(after.users[0]?.name, before.users[0]?.name);
  assert.equal(after.licenses[0]?.status, LicenseKeyStatus.DISABLED);
  assert.equal(after.licenses[0]?.redeemedByUserId, "user-original");
  assert.equal(after.licenses[1]?.status, LicenseKeyStatus.USED);
  assert.equal(after.licenses[1]?.redeemedByUserId, "user-original");
});

test("禁用旧卡且密码留空时保留原密码", async () => {
  const harness = createTransactionHarness(createState(LicenseKeyStatus.DISABLED));

  await harness.transaction((tx) =>
    commitUserLicenseReactivation(tx, createCommitInput("disabled", null))
  );

  assert.equal(harness.read().users[0]?.passwordHash, "old-password-hash");
});

test("过期旧卡支持设置新密码或保留原密码", async () => {
  assert.doesNotThrow(() => assertUserLicenseReactivationAllowed("expired"));

  for (const nextPasswordHash of ["replacement-hash", null]) {
    const harness = createTransactionHarness(createState(LicenseKeyStatus.USED));

    await harness.transaction((tx) =>
      commitUserLicenseReactivation(tx, createCommitInput("expired", nextPasswordHash))
    );

    assert.equal(
      harness.read().users[0]?.passwordHash,
      nextPasswordHash ?? "old-password-hash"
    );
  }
});

test("有效账号和无授权账号不能进入免原密码换卡恢复", () => {
  assert.throws(
    () => assertUserLicenseReactivationAllowed("active"),
    ValidationError
  );
  assert.throws(
    () => assertUserLicenseReactivationAllowed("missing"),
    ValidationError
  );
});

test("新卡必须为未使用、未绑定、未禁用、未过期的用户端卡密", () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);
  const base = {
    id: "license",
    status: LicenseKeyStatus.UNUSED,
    redeemedByUserId: null,
    expiresAt: future,
    appType: "user_app" as const
  };

  assert.equal(resolveRedeemableUserLicense([base]).id, "license");
  assert.throws(
    () => resolveRedeemableUserLicense([{ ...base, appType: "ingest_admin" }]),
    LicenseAppTypeMismatchError
  );
  assert.throws(
    () => resolveRedeemableUserLicense([{ ...base, status: LicenseKeyStatus.DISABLED }]),
    LicenseDisabledError
  );
  assert.throws(
    () => resolveRedeemableUserLicense([{ ...base, expiresAt: past }]),
    LicenseExpiredError
  );
  assert.throws(
    () => resolveRedeemableUserLicense([{
      ...base,
      status: LicenseKeyStatus.USED,
      redeemedByUserId: "another-user"
    }]),
    LicenseActivationLimitReachedError
  );
  assert.throws(
    () => resolveRedeemableUserLicense([{ ...base, redeemedByUserId: "another-user" }]),
    LicenseActivationLimitReachedError
  );
});

test("两个并发请求争用同一新卡时只有一个成功", async () => {
  const harness = createTransactionHarness(createState(LicenseKeyStatus.DISABLED));
  const results = await Promise.allSettled([
    harness.transaction((tx) =>
      commitUserLicenseReactivation(tx, createCommitInput("disabled", "hash-a"))
    ),
    harness.transaction((tx) =>
      commitUserLicenseReactivation(tx, createCommitInput("disabled", "hash-b"))
    )
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.ok(
    results.some((result) =>
      result.status === "rejected" &&
      result.reason instanceof LicenseActivationLimitReachedError
    )
  );
  assert.equal(harness.read().licenses[1]?.redeemedByUserId, "user-original");
});

test("审计失败会回滚新卡、密码和授权状态", async () => {
  const harness = createTransactionHarness(createState(LicenseKeyStatus.DISABLED));
  const before = harness.read();

  await assert.rejects(
    harness.transaction(
      (tx) => commitUserLicenseReactivation(
        tx,
        createCommitInput("disabled", "must-not-persist")
      ),
      { failAudit: true }
    ),
    /simulated audit failure/
  );

  assert.deepEqual(harness.read(), before);
});

test("恢复不改变用户ID、网名、聊天记录、知识归属或已有会话", async () => {
  const harness = createTransactionHarness(createState(LicenseKeyStatus.DISABLED));
  const before = harness.read();

  await harness.transaction((tx) =>
    commitUserLicenseReactivation(tx, createCommitInput("disabled", null))
  );
  const after = harness.read();

  assert.equal(after.users[0]?.id, before.users[0]?.id);
  assert.equal(after.users[0]?.phone, before.users[0]?.phone);
  assert.equal(after.users[0]?.name, before.users[0]?.name);
  assert.deepEqual(after.sessions, before.sessions);
  assert.deepEqual(after.conversations, before.conversations);
  assert.deepEqual(after.messages, before.messages);
  assert.deepEqual(after.knowledgeItems, before.knowledgeItems);
  assert.equal(after.activationLogs.length, 1);
  assert.equal(after.auditLogs.length, 1);
});
