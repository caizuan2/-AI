import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseIngestChangePasswordRequest } from "@/lib/enterprise/ingest-auth-credentials";

function testChangePasswordValidation() {
  assert.deepEqual(
    parseIngestChangePasswordRequest({
      currentPassword: "old-password",
      newPassword: "new-password-123",
      confirmPassword: "new-password-123"
    }),
    {
      currentPassword: "old-password",
      newPassword: "new-password-123"
    }
  );

  assert.throws(
    () => parseIngestChangePasswordRequest({
      currentPassword: "old-password",
      newPassword: "short",
      confirmPassword: "short"
    }),
    /新密码至少需要 8 位/
  );
  assert.throws(
    () => parseIngestChangePasswordRequest({
      currentPassword: "old-password",
      newPassword: "new-password-123",
      confirmPassword: "different-password"
    }),
    /两次输入的新密码不一致/
  );
  assert.throws(
    () => parseIngestChangePasswordRequest({
      currentPassword: "same-password",
      newPassword: "same-password",
      confirmPassword: "same-password"
    }),
    /新密码不能与当前密码相同/
  );
}

function testIngestOnlyPasswordRoute() {
  const routeSource = readFileSync(
    "app/api/ingest/auth/change-password/route.ts",
    "utf8"
  );

  assert.match(routeSource, /requireAdminIngestChatAccess/);
  assert.match(routeSource, /verifyPassword\(input\.currentPassword/);
  assert.match(routeSource, /hashPassword\(input\.newPassword\)/);
  assert.match(routeSource, /prisma\.\$transaction/);
  assert.match(routeSource, /prisma\.session\.deleteMany/);
  assert.match(routeSource, /SESSION_COOKIE_NAME/);
  assert.match(routeSource, /INGEST_PORTAL_COOKIE_NAME/);
  assert.match(routeSource, /sessionsRevoked:\s*true/);
}

function testAccountPanelUsesRealPasswordForm() {
  const settingsSource = readFileSync(
    "components/enterprise-admin/IngestSettingsPanel.tsx",
    "utf8"
  );
  const modeSource = readFileSync(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );
  const clientSource = readFileSync(
    "lib/enterprise/admin-ingest-account-security-client.ts",
    "utf8"
  );

  assert.match(settingsSource, /await onPasswordChange/);
  assert.match(settingsSource, /autoComplete="current-password"/);
  assert.match(settingsSource, /autoComplete="new-password"/);
  assert.match(settingsSource, /确认新密码/);
  assert.match(settingsSource, /确认修改/);
  assert.doesNotMatch(settingsSource, /密码修改功能将在账号中心接入后启用/);
  assert.match(modeSource, /changeAdminIngestAccountPassword/);
  assert.match(modeSource, /passwordChanged=1/);
  assert.match(clientSource, /\/api\/ingest\/auth\/change-password/);
}

testChangePasswordValidation();
testIngestOnlyPasswordRoute();
testAccountPanelUsesRealPasswordForm();

console.log("admin ingest change password tests passed");
