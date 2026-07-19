import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ValidationError } from "@/lib/errors";
import { sanitizeLogMetadata } from "@/lib/logger";
import {
  isValidTeamOsEncryptionKey,
  validateTeamOsProductionEnvironment
} from "@/apps/team-os/features/production/services/environment";
import {
  createTeamOsApiErrorHandler,
  createTeamOsErrorReport,
  TEAM_OS_ERROR_ID_HEADER
} from "@/apps/team-os/features/production/services/error-handler";
import { readTeamOsJson } from "@/apps/team-os/features/production/services/production-http";
import { toTeamOsSafeErrorMetadata } from "@/apps/team-os/features/production/services/production-logger";
import {
  TEAM_OS_RELEASE,
  getTeamOsRuntimeEnvironment,
  getTeamOsVersionInfo
} from "@/apps/team-os/features/production/version";

assert.equal(TEAM_OS_RELEASE.version, "1.0.0");
assert.equal(TEAM_OS_RELEASE.buildNumber, "2026071301");
assert.equal(TEAM_OS_RELEASE.releaseDate, "2026-07-13");
assert.equal(getTeamOsRuntimeEnvironment({ NODE_ENV: "production" }), "production");
assert.equal(getTeamOsRuntimeEnvironment({ TEAM_OS_ENVIRONMENT: "staging" }), "staging");
assert.equal(
  getTeamOsVersionInfo({ TEAM_OS_ENVIRONMENT: "production", WEB_RELEASE_SHA: "a".repeat(40) }).releaseSha,
  "a".repeat(40)
);
assert.equal(getTeamOsVersionInfo({ WEB_RELEASE_SHA: "unreleased" }).releaseSha, "unknown");

const encryptionKey = "a".repeat(64);
assert.equal(isValidTeamOsEncryptionKey(encryptionKey), true);
assert.equal(isValidTeamOsEncryptionKey("short"), false);
assert.equal(isValidTeamOsEncryptionKey(`${"a".repeat(43)}!!!!`), false);

const validEnvironment = validateTeamOsProductionEnvironment({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:password@db.example.com:5432/team_os",
  DIRECT_URL: "postgresql://user:password@db.example.com:5432/team_os",
  AI_PROVIDER: "qwen",
  QWEN_API_KEY: "qwen-production-contract-key-20260713",
  OPENAI_API_KEY: "openai-production-contract-key-20260713",
  DEEPSEEK_API_KEY: "",
  NEXT_PUBLIC_APP_URL: "https://team-os.contract.invalid",
  APP_URL: "https://team-os.contract.invalid",
  SESSION_SECRET: "phase12-session-secret-20260713-contract-value",
  ENCRYPTION_KEY: encryptionKey
});
assert.equal(validEnvironment.ok, true);
assert.equal(validEnvironment.provider, "qwen");

const invalidEnvironment = validateTeamOsProductionEnvironment({
  ...Object.fromEntries(validEnvironment.checks.map((item) => [item.key, ""])),
  AI_PROVIDER: "unsupported"
});
assert.equal(invalidEnvironment.ok, false);

const templateEnvironment = validateTeamOsProductionEnvironment({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://APP_USER:APP_PASSWORD@DB_HOST:5432/APP_DATABASE",
  DIRECT_URL: "postgresql://MIGRATION_USER:MIGRATION_PASSWORD@DB_HOST:5432/APP_DATABASE",
  AI_PROVIDER: "qwen",
  QWEN_API_KEY: "qwen-production-contract-key-20260713",
  OPENAI_API_KEY: "openai-production-contract-key-20260713",
  NEXT_PUBLIC_APP_URL: "https://team-os.example.com",
  APP_URL: "https://team-os.example.com",
  SESSION_SECRET: "phase12-session-secret-20260713-contract-value",
  ENCRYPTION_KEY: encryptionKey
});
assert.equal(templateEnvironment.ok, false);
assert.equal(TEAM_OS_ERROR_ID_HEADER, "x-team-os-error-id");

const mismatchedEncryptionKeys = validateTeamOsProductionEnvironment({
  ...validEnvironment.checks.reduce<Record<string, string>>((values, item) => {
    values[item.key] = "";
    return values;
  }, {}),
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:password@db.contract.invalid:5432/team_os",
  DIRECT_URL: "postgresql://user:password@db.contract.invalid:5432/team_os",
  AI_PROVIDER: "openai",
  OPENAI_API_KEY: "openai-production-contract-key-20260713",
  NEXT_PUBLIC_APP_URL: "https://team-os.contract.invalid",
  APP_URL: "https://team-os.contract.invalid",
  SESSION_SECRET: "phase12-session-secret-20260713-contract-value",
  ENCRYPTION_KEY: encryptionKey,
  TEAM_OS_INTEGRATION_ENCRYPTION_KEY: "b".repeat(64)
});
assert.equal(mismatchedEncryptionKeys.ok, false);

const safeMetadata = sanitizeLogMetadata({
  companyId: "company-a",
  userId: "user-a",
  password: "plain-password",
  apiKey: "sk-secret-key-value"
});
assert.equal(safeMetadata.companyId, "company-a");
assert.equal(safeMetadata.userId, "user-a");
assert.equal(safeMetadata.password, "[redacted]");
assert.equal(safeMetadata.apiKey, "[redacted]");

const safeTeamOsError = toTeamOsSafeErrorMetadata(
  new Error("customer foo@example.org 13800138000")
);
assert.equal(JSON.stringify(safeTeamOsError).includes("foo@example.org"), false);
assert.equal(JSON.stringify(safeTeamOsError).includes("13800138000"), false);

const taskRepositorySource = readFileSync(
  "apps/team-os/features/tasks/services/task-repository.ts",
  "utf8"
);
assert.match(taskRepositorySource, /userId,\s*status: "ACTIVE",\s*team: \{ status: "ACTIVE" \}/);
assert.match(taskRepositorySource, /members: \{ some: \{ userId, status: "ACTIVE" \} \}/);

const schemaSource = readFileSync("prisma/schema.prisma", "utf8");
for (const indexName of [
  "team_organizations_company_status_created_idx",
  "team_members_team_status_created_idx",
  "team_members_user_status_created_idx",
  "team_invitations_team_status_expires_idx",
  "team_os_tenant_subscriptions_company_created_idx",
  "team_tasks_team_status_deadline_created_idx",
  "task_submissions_user_created_idx"
]) {
  assert.match(schemaSource, new RegExp(indexName));
}

const errorReport = createTeamOsErrorReport(new ValidationError("invalid"), {
  module: "API",
  requestId: "request-123",
  userId: "user-a",
  companyId: "company-a"
});
assert.match(errorReport.errorId, /^tos_/);
assert.equal(errorReport.code, "VALIDATION_ERROR");
assert.equal(errorReport.statusCode, 400);
assert.equal(errorReport.userId, "user-a");
assert.equal(errorReport.companyId, "company-a");

async function verifyBoundedJsonReader() {
  const errorResponse = await createTeamOsApiErrorHandler("API")(new ValidationError("invalid"));
  assert.equal(errorResponse.status, 400);
  assert.match(errorResponse.headers.get(TEAM_OS_ERROR_ID_HEADER) ?? "", /^tos_/);

  const parsed = await readTeamOsJson(new Request("https://team-os.example.com/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companyId: "company-a" })
  }), { maxBytes: 1024 });
  assert.deepEqual(parsed, { companyId: "company-a" });

  await assert.rejects(
    () => readTeamOsJson(new Request("https://team-os.example.com/api", {
      method: "POST",
      body: "not-json"
    })),
    (error: unknown) => error instanceof ValidationError && /合法 JSON/.test(error.message)
  );

  await assert.rejects(
    () => readTeamOsJson(new Request("https://team-os.example.com/api", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(128) })
    }), { maxBytes: 32 }),
    (error: unknown) => error instanceof ValidationError && /不能超过/.test(error.message)
  );
}

verifyBoundedJsonReader()
  .then(() => console.log("AI Team OS production contract tests passed."))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
