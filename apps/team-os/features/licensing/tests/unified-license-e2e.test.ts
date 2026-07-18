import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { LicenseKeyStatus, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const baseUrl = process.env.TEAM_OS_E2E_BASE_URL?.replace(/\/$/, "");

if (!baseUrl) {
  throw new Error("TEAM_OS_E2E_BASE_URL is required.");
}

if (!process.env.DATABASE_URL?.includes("team_os_e2e_")) {
  throw new Error("Refusing to run outside an isolated team_os_e2e_* database.");
}

const prisma = new PrismaClient();
const password = "TeamOs-E2E-Password-2026!";
const runSuffix = Date.now().toString().slice(-8);
let phoneCounter = 0;
let ipCounter = 10;

type JsonObject = Record<string, unknown>;

type Session = {
  cookie: string;
  phone: string;
  userId: string;
};

type GeneratedLicense = {
  id: string;
  key: string;
  appType: "user_app" | "ingest_admin" | "team_os";
};

function nextPhone() {
  phoneCounter += 1;
  return `199${runSuffix.slice(-6)}${String(phoneCounter).padStart(2, "0")}`;
}

function nextIp() {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
}

function asObject(value: unknown): JsonObject {
  assert(value && typeof value === "object" && !Array.isArray(value), "Expected a JSON object response.");
  return value as JsonObject;
}

function responseData(payload: JsonObject) {
  return asObject(payload.data);
}

function sessionCookie(response: Response) {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(/(?:^|,\s*)(ai_kb_session=[^;]+)/);
  assert(match?.[1], "Expected ai_kb_session cookie.");
  return match[1];
}

async function api(path: string, options: {
  method?: string;
  body?: JsonObject;
  cookie?: string;
  ip?: string;
} = {}) {
  const headers = new Headers({
    accept: "application/json",
    "x-forwarded-for": options.ip ?? nextIp()
  });
  if (options.body) headers.set("content-type", "application/json");
  if (options.cookie) headers.set("cookie", options.cookie);

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: "manual"
  });
  const raw = await response.text();
  let payload: JsonObject;
  try {
    payload = asObject(JSON.parse(raw));
  } catch {
    throw new Error(`${options.method ?? "GET"} ${path} returned non-JSON ${response.status}: ${raw.slice(0, 300)}`);
  }
  return { response, payload };
}

function assertSuccess(result: Awaited<ReturnType<typeof api>>, expectedStatus?: number) {
  if (expectedStatus !== undefined) assert.equal(result.response.status, expectedStatus);
  assert.equal(result.payload.success, true, JSON.stringify(result.payload));
  assert(result.response.ok, JSON.stringify(result.payload));
  return responseData(result.payload);
}

function assertFailure(
  result: Awaited<ReturnType<typeof api>>,
  expectedCode: string,
  expectedStatus?: number
) {
  if (expectedStatus !== undefined) assert.equal(result.response.status, expectedStatus, JSON.stringify(result.payload));
  assert.equal(result.payload.success, false, JSON.stringify(result.payload));
  assert.equal(result.payload.code ?? asObject(result.payload.error).code, expectedCode, JSON.stringify(result.payload));
  return result.payload;
}

async function login(phone: string, ip = nextIp()): Promise<Session> {
  const result = await api("/api/auth/login", {
    body: { phone, password },
    ip
  });
  const data = assertSuccess(result);
  const user = asObject(data.user);
  return {
    cookie: sessionCookie(result.response),
    phone,
    userId: String(user.id)
  };
}

async function registerAccount(label: string, email: string, extras: JsonObject = {}): Promise<Session> {
  const phone = nextPhone();
  const ip = nextIp();
  const result = await api("/api/team-os/auth/register", {
    body: {
      name: label,
      phone,
      email,
      password,
      ...extras
    },
    ip
  });
  const data = assertSuccess(result, 201);
  const user = asObject(data.user);
  return {
    cookie: sessionCookie(result.response),
    phone,
    userId: String(user.id)
  };
}

async function generateLicense(
  admin: Session,
  appType: GeneratedLicense["appType"],
  overrides: JsonObject = {}
): Promise<GeneratedLicense> {
  const result = await api("/api/super-admin/licenses/generate", {
    cookie: admin.cookie,
    body: {
      appType,
      plan: "pro",
      count: 1,
      expiresInDays: 30,
      subscriptionDays: 90,
      maxActivations: 1,
      note: `isolated-e2e-${runSuffix}`,
      ...overrides
    }
  });
  const data = assertSuccess(result);
  const generated = data.generated;
  assert(Array.isArray(generated) && generated.length === 1, JSON.stringify(data));
  return generated[0] as GeneratedLicense;
}

async function activateCompany(owner: Session, key: string, name: string) {
  const result = await api("/api/team-os/auth/activate", {
    cookie: owner.cookie,
    body: { code: key, companyName: name, industry: "E2E Test" }
  });
  return { result, data: result.response.ok ? assertSuccess(result, 201) : null };
}

async function createCompany(admin: Session, owner: Session, name: string) {
  const license = await generateLicense(admin, "team_os");
  const activation = await activateCompany(owner, license.key, name);
  assert(activation.data);
  return { license, activation: activation.data };
}

async function verifyDualProductAccount(
  admin: Session,
  label: string,
  activationOrder: Array<"user_app" | "ingest_admin">
) {
  const account = await registerAccount(label, `${label.toLowerCase().replace(/\s+/g, "-")}-${runSuffix}@example.test`);
  const licenses = {
    user_app: await generateLicense(admin, "user_app"),
    ingest_admin: await generateLicense(admin, "ingest_admin")
  };

  for (const product of activationOrder) {
    const result = product === "user_app"
      ? await api("/api/activate", {
          cookie: account.cookie,
          body: { code: licenses.user_app.key, appType: "user_app" }
        })
      : await api("/api/ingest/auth/activate-license", {
          cookie: account.cookie,
          body: { licenseKey: licenses.ingest_admin.key, appType: "user_app", role: "super_admin" }
        });
    assertSuccess(result);
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: account.userId },
    select: { role: true, licenseActivated: true }
  });
  assert.equal(user.role, "kb_admin");
  assert.equal(user.licenseActivated, true);

  const ingestProbe = assertSuccess(await api("/api/admin/quick-actions", {
    cookie: account.cookie
  }));
  assert(Array.isArray(ingestProbe.quickActions));

  const userProbe = await api(`/api/user/conversations/missing-${runSuffix}`, {
    cookie: account.cookie,
    method: "DELETE"
  });
  assertFailure(userProbe, "NOT_FOUND", 404);

  const usedLicenses = await prisma.licenseKey.count({
    where: {
      id: { in: [licenses.user_app.id, licenses.ingest_admin.id] },
      redeemedByUserId: account.userId,
      status: LicenseKeyStatus.USED
    }
  });
  assert.equal(usedLicenses, 2);
}

async function main() {
  const adminPhone = nextPhone();
  const adminPasswordHash = await bcrypt.hash(password, 4);
  const adminUser = await prisma.user.create({
    data: {
      phone: `+86${adminPhone}`,
      email: `superadmin-${runSuffix}@example.test`,
      name: "E2E Super Admin",
      passwordHash: adminPasswordHash,
      role: "super_admin",
      isActive: true,
      licenseActivated: false
    },
    select: { id: true }
  });
  assert(adminUser.id);
  const admin = await login(adminPhone);

  const legacyUser = await registerAccount("Legacy User", `legacy-user-${runSuffix}@example.test`);
  await prisma.user.update({
    where: { id: legacyUser.userId },
    data: { licenseActivated: true }
  });
  const legacyUserProbe = assertSuccess(await api("/api/user/conversation-features", {
    cookie: legacyUser.cookie
  }));
  assert.equal(typeof legacyUserProbe.rename, "boolean");

  const metadataLessAdmin = await registerAccount(
    "Metadata-less Admin",
    `metadata-less-admin-${runSuffix}@example.test`
  );
  await prisma.user.update({
    where: { id: metadataLessAdmin.userId },
    data: { role: "kb_admin", licenseActivated: true }
  });
  await prisma.licenseKey.create({
    data: {
      keyHash: createHash("sha256").update(`metadata-less:${runSuffix}`).digest("hex"),
      status: LicenseKeyStatus.USED,
      redeemedByUserId: metadataLessAdmin.userId,
      redeemedAt: new Date()
    }
  });
  const metadataLessUserProbe = await api("/api/user/conversation-features", {
    cookie: metadataLessAdmin.cookie
  });
  assertFailure(metadataLessUserProbe, "FORBIDDEN", 403);
  const metadataLessIngestProbe = await api("/api/admin/quick-actions", {
    cookie: metadataLessAdmin.cookie
  });
  assertFailure(metadataLessIngestProbe, "LICENSE_APP_TYPE_MISMATCH", 403);

  await verifyDualProductAccount(admin, "Dual User First", ["user_app", "ingest_admin"]);
  await verifyDualProductAccount(admin, "Dual Ingest First", ["ingest_admin", "user_app"]);

  const owner = await registerAccount(
    "Pilot Owner",
    `owner-${runSuffix}@example.test`,
    { role: "super_admin", appType: "ingest_admin", licenseActivated: true }
  );
  const ownerRecord = await prisma.user.findUniqueOrThrow({
    where: { id: owner.userId },
    select: { role: true, licenseActivated: true, tenantId: true }
  });
  assert.equal(ownerRecord.role, "user", "Team OS registration must not accept a client-selected role.");
  assert.equal(ownerRecord.licenseActivated, false, "Team OS registration must not activate the user app.");
  assert.equal(ownerRecord.tenantId, null, "Team OS registration must not alter the shared tenant relation.");

  const primary = await createCompany(admin, owner, `Pilot Company ${runSuffix}`);
  const company = asObject(primary.activation.company);
  const defaultTeam = asObject(primary.activation.defaultTeam);
  assert.equal(primary.activation.role, "TEAM_OWNER");
  assert.equal(primary.activation.idempotent, false);

  const ownerAccess = assertSuccess(await api("/api/team-os/auth/access", { cookie: owner.cookie }));
  assert.equal(ownerAccess.allowed, true);
  assert.equal(ownerAccess.status, "ACTIVE");
  assert.equal(asObject(ownerAccess.team).role, "TEAM_OWNER");

  const ownerAfterActivation = await prisma.user.findUniqueOrThrow({
    where: { id: owner.userId },
    select: { role: true, licenseActivated: true, tenantId: true }
  });
  assert.deepEqual(ownerAfterActivation, ownerRecord, "Team OS activation changed shared user privileges.");
  const ownerUserAppProbe = await api("/api/ai/chat/conversations", { cookie: owner.cookie });
  assertFailure(ownerUserAppProbe, "FORBIDDEN", 403);

  const renewal = assertSuccess(await api(`/api/super-admin/licenses/${primary.license.id}/renew`, {
    cookie: admin.cookie,
    body: { days: 30 }
  }));
  assert.equal(renewal.appType, "team_os");
  assert.equal(renewal.status, LicenseKeyStatus.USED);
  assert(renewal.subscriptionEndsAt);

  const customPlanDescription = `custom-plan-${runSuffix}`;
  await prisma.subscriptionPlan.update({
    where: { id: "team-os-plan-professional-v1" },
    data: { description: customPlanDescription }
  });
  await prisma.featurePermission.update({
    where: {
      planId_featureKey: {
        planId: "team-os-plan-professional-v1",
        featureKey: "crm"
      }
    },
    data: { enabled: false }
  });

  const employeeEmail = `employee-${runSuffix}@example.test`;
  const invitationData = assertSuccess(await api("/api/team-os/invitations", {
    cookie: owner.cookie,
    body: {
      teamId: String(defaultTeam.id),
      email: employeeEmail,
      role: "TEAM_MEMBER",
      appType: "team_os",
      accountRole: "TEAM_OWNER"
    }
  }), 201);
  const invitation = asObject(invitationData.invitation);
  const inviteCode = String(invitation.inviteCode);

  const duplicateInvite = await api("/api/team-os/invitations", {
    cookie: owner.cookie,
    body: { teamId: String(defaultTeam.id), email: employeeEmail, role: "TEAM_MANAGER" }
  });
  assertFailure(duplicateInvite, "VALIDATION_ERROR", 400);

  const employee = await registerAccount("Pilot Employee", employeeEmail, {
    role: "TEAM_OWNER",
    appType: "team_os"
  });
  const accepted = assertSuccess(await api(`/api/team-os/auth/invitations/${encodeURIComponent(inviteCode)}`, {
    cookie: employee.cookie,
    method: "POST"
  }));
  assert.equal(accepted.role, "TEAM_MEMBER", "Invitation role must come from the stored invitation.");
  assert.equal(accepted.companyId, company.id);
  assert.equal(accepted.idempotent, false);

  const employeeLogin = await login(employee.phone);
  const employeeAccess = assertSuccess(await api("/api/team-os/auth/access", { cookie: employeeLogin.cookie }));
  assert.equal(employeeAccess.allowed, true);
  assert.equal(asObject(employeeAccess.team).role, "TEAM_MEMBER");

  const notFoundOwner = await registerAccount("Not Found Owner", `notfound-${runSuffix}@example.test`);
  const notFound = await activateCompany(notFoundOwner, "XT-TEAM-AAAA-BBBB-CCCC-DDDD", "Not Found Co");
  assertFailure(notFound.result, "LICENSE_NOT_FOUND", 404);

  const wrongTypeOwner = await registerAccount("Wrong Type Owner", `wrong-${runSuffix}@example.test`);
  const userAppLicense = await generateLicense(admin, "user_app");
  const wrongType = await activateCompany(wrongTypeOwner, userAppLicense.key, "Wrong Type Co");
  assertFailure(wrongType.result, "LICENSE_APP_TYPE_MISMATCH", 403);

  const usedOwner = await registerAccount("Used Card Owner", `used-${runSuffix}@example.test`);
  await prisma.licenseKey.create({
    data: {
      keyHash: createHash("sha256").update(`aikb-license:${primary.license.key}`).digest("hex"),
      status: LicenseKeyStatus.UNUSED
    }
  });
  const used = await activateCompany(usedOwner, primary.license.key, "Used Card Co");
  assertFailure(used.result, "LICENSE_ACTIVATION_LIMIT_REACHED", 403);

  const disabledOwner = await registerAccount("Disabled Card Owner", `disabled-${runSuffix}@example.test`);
  const disabledLicense = await generateLicense(admin, "team_os");
  const customizedPlan = await prisma.subscriptionPlan.findUniqueOrThrow({
    where: { id: "team-os-plan-professional-v1" },
    select: {
      description: true,
      featurePermissions: {
        where: { featureKey: "crm" },
        select: { enabled: true }
      }
    }
  });
  assert.equal(customizedPlan.description, customPlanDescription, "Issuing a card overwrote the existing plan.");
  assert.equal(customizedPlan.featurePermissions[0]?.enabled, false, "Issuing a card re-enabled a disabled feature.");
  const disabled = assertSuccess(await api(`/api/super-admin/licenses/${disabledLicense.id}/disable`, {
    cookie: admin.cookie,
    method: "POST"
  }));
  assert.equal(disabled.status, LicenseKeyStatus.DISABLED);
  const disabledActivation = await activateCompany(disabledOwner, disabledLicense.key, "Disabled Co");
  assertFailure(disabledActivation.result, "LICENSE_DISABLED", 403);

  const expiredOwner = await registerAccount("Expired Card Owner", `expired-${runSuffix}@example.test`);
  const expiredLicense = await generateLicense(admin, "team_os");
  await prisma.licenseKey.update({
    where: { id: expiredLicense.id },
    data: { expiresAt: new Date(Date.now() - 60_000) }
  });
  const expiredActivation = await activateCompany(expiredOwner, expiredLicense.key, "Expired Co");
  assertFailure(expiredActivation.result, "LICENSE_EXPIRED", 403);

  const duplicateRegistration = await api("/api/team-os/auth/register", {
    body: {
      name: "Duplicate Employee",
      phone: employee.phone,
      email: `duplicate-${runSuffix}@example.test`,
      password
    }
  });
  assertFailure(duplicateRegistration, "VALIDATION_ERROR", 409);

  const secondOwner = usedOwner;
  const secondCompany = await createCompany(admin, secondOwner, `Second Company ${runSuffix}`);
  const secondTeam = asObject(secondCompany.activation.defaultTeam);
  const crossInvitationData = assertSuccess(await api("/api/team-os/invitations", {
    cookie: secondOwner.cookie,
    body: { teamId: String(secondTeam.id), email: employeeEmail, role: "TEAM_MEMBER" }
  }), 201);
  const crossInvitation = asObject(crossInvitationData.invitation);
  const crossAccept = await api(
    `/api/team-os/auth/invitations/${encodeURIComponent(String(crossInvitation.inviteCode))}`,
    { cookie: employeeLogin.cookie, method: "POST" }
  );
  assertFailure(crossAccept, "FORBIDDEN", 403);

  const dashboard = assertSuccess(await api("/api/super-admin/licenses", { cookie: admin.cookie }));
  const licenses = dashboard.licenses;
  const activations = dashboard.activations;
  assert(Array.isArray(licenses));
  assert(Array.isArray(activations));
  assert(licenses.some((item) => asObject(item).id === primary.license.id));
  assert(activations.some((item) => {
    const activation = asObject(item);
    return activation.licenseId === primary.license.id && activation.success === true;
  }));
  assert(activations.some((item) => asObject(item).success === false));

  const teamOsBindings = await prisma.auditLog.count({
    where: {
      action: "redeem_team_os_license_key",
      targetType: "license_key"
    }
  });
  assert(teamOsBindings >= 2);
  assert.equal(await prisma.auditLog.count({ where: { targetType: "team_os_license_grant" } }), 0);

  console.log(JSON.stringify({
    success: true,
    isolatedDatabase: true,
    unifiedProducts: ["user_app", "ingest_admin", "team_os"],
    happyPath: {
      companyCreated: true,
      defaultTeamCreated: true,
      ownerRole: "TEAM_OWNER",
      employeeRole: "TEAM_MEMBER",
      employeeLogin: "ACTIVE",
      centralizedRenewal: true,
      activationRecordVisible: true
    },
    dualProductAccess: {
      userThenIngest: "PASS",
      ingestThenUser: "PASS"
    },
    failures: {
      licenseNotFound: "PASS",
      licenseTypeMismatch: "PASS",
      licenseUsed: "PASS",
      licenseDisabled: "PASS",
      licenseExpired: "PASS",
      duplicateRegistration: "PASS",
      duplicateInvitation: "PASS",
      crossCompanyInvitation: "PASS"
    },
    sharedUserPrivilegesUnchanged: true,
    teamOsOwnerUserAppDenied: true,
    metadataLessAdminUserAppDenied: true,
    legacyUserFallbackPreserved: true,
    legacyHashReplayBlocked: true,
    existingPlanCustomizationPreserved: true
  }, null, 2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
