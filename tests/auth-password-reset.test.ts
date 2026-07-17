import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PASSWORD_RESET_MAX_LENGTH,
  PASSWORD_RESET_MIN_LENGTH,
  parsePasswordResetRequest
} from "../lib/auth/password-reset";

test("password reset input normalizes the phone and accepts a matching confirmation", () => {
  assert.deepEqual(parsePasswordResetRequest({
    phone: "186 2877 7821",
    licenseKey: " xt-user-abcd-efgh-jkmn ",
    newPassword: "new-password-123",
    confirmPassword: "new-password-123"
  }), {
    phone: "+8618628777821",
    licenseKey: "xt-user-abcd-efgh-jkmn",
    newPassword: "new-password-123"
  });
});

test("password reset input rejects incomplete or unsafe passwords", () => {
  assert.throws(
    () => parsePasswordResetRequest(null),
    /请求体必须是 JSON 对象/
  );
  assert.throws(
    () => parsePasswordResetRequest({
      phone: "123",
      licenseKey: "XT-USER-ABCD-EFGH-JKMN",
      newPassword: "new-password-123",
      confirmPassword: "new-password-123"
    }),
    /请输入合法手机号/
  );
  assert.throws(
    () => parsePasswordResetRequest({
      phone: "18628777821",
      licenseKey: "",
      newPassword: "new-password-123",
      confirmPassword: "new-password-123"
    }),
    /原先激活使用的用户端卡密/
  );
  assert.throws(
    () => parsePasswordResetRequest({
      phone: "18628777821",
      licenseKey: "XT-USER-ABCD-EFGH-JKMN",
      newPassword: "short",
      confirmPassword: "short"
    }),
    new RegExp(`至少需要 ${PASSWORD_RESET_MIN_LENGTH} 位`)
  );
  assert.throws(
    () => parsePasswordResetRequest({
      phone: "18628777821",
      licenseKey: "XT-USER-ABCD-EFGH-JKMN",
      newPassword: "a".repeat(PASSWORD_RESET_MAX_LENGTH + 1),
      confirmPassword: "a".repeat(PASSWORD_RESET_MAX_LENGTH + 1)
    }),
    new RegExp(`不能超过 ${PASSWORD_RESET_MAX_LENGTH} 位`)
  );
  assert.throws(
    () => parsePasswordResetRequest({
      phone: "18628777821",
      licenseKey: "XT-USER-ABCD-EFGH-JKMN",
      newPassword: "new-password-123",
      confirmPassword: "different-password"
    }),
    /两次输入的新密码不一致/
  );
});

test("the unified user login keeps password reset and retires the registration page", () => {
  const loginPage = readFileSync("app/login/page.tsx", "utf8");
  const registerPage = readFileSync("app/register/page.tsx", "utf8");

  assert.match(loginPage, /忘记密码？/);
  assert.match(loginPage, /requestedApp\.includes\("admin"\)/);
  assert.match(loginPage, /nextPathname === "\/admin"/);
  assert.match(loginPage, /nextProduct === "ingest_admin"/);
  assert.match(loginPage, /href=\{forgotPasswordHref\}/);
  assert.match(loginPage, /\/api\/auth\/user-entry/);
  assert.match(registerPage, /redirect\("\/login\?first=1"\)/);
  assert.doesNotMatch(loginPage, /href="\/register"/);
});

test("password reset page submits the complete user verification payload", () => {
  const resetPage = readFileSync("app/forgot-password/page.tsx", "utf8");

  assert.match(resetPage, /fetch\("\/api\/auth\/reset-password"/);
  assert.match(resetPage, /phone,/);
  assert.match(resetPage, /licenseKey,/);
  assert.match(resetPage, /newPassword,/);
  assert.match(resetPage, /confirmPassword/);
  assert.match(resetPage, /原激活卡密/);
  assert.match(resetPage, /role="alert"/);
  assert.match(resetPage, /没有保存原卡密或账号尚未激活/);
});

test("password reset API verifies the bound user card and only updates the password", () => {
  const resetRoute = readFileSync("app/api/auth/reset-password/route.ts", "utf8");

  assert.match(resetRoute, /getLicenseAppTypeFromKey\(normalizedLicenseKey\) === "user_app"/);
  assert.match(resetRoute, /status: LicenseKeyStatus\.USED/);
  assert.match(resetRoute, /license\.redeemedByUserId !== user\.id/);
  assert.match(resetRoute, /expiresAt: \{ gt: new Date\(\) \}/);
  assert.match(resetRoute, /hasUserClientAccess\(accessProfile\)/);
  assert.match(resetRoute, /checkPersistentRateLimit/);
  assert.match(resetRoute, /limit: 5/);
  assert.match(resetRoute, /passwordHash/);
  assert.doesNotMatch(resetRoute, /prisma\.session\.(?:delete|deleteMany)/);
  assert.match(resetRoute, /手机号或卡密验证失败/);
  assert.doesNotMatch(resetRoute, /prisma\.licenseKey\.(?:update|delete)/);
});
