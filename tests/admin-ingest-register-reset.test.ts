import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  INGEST_PASSWORD_MAX_LENGTH,
  INGEST_PASSWORD_MIN_LENGTH,
  parseIngestAccountReactivationRequest,
  parseIngestPasswordResetRequest,
  parseIngestRegisterRequest
} from "../lib/enterprise/ingest-auth-credentials";

test("ingest registration normalizes account data and requires a license key", () => {
  assert.deepEqual(parseIngestRegisterRequest({
    name: " 管理员 ",
    phone: "186 2877 7821",
    password: "new-password-123",
    confirmPassword: "new-password-123",
    licenseKey: " xt-ingest-abcd-efgh-jkmn "
  }), {
    name: "管理员",
    phone: "+8618628777821",
    password: "new-password-123",
    licenseKey: "xt-ingest-abcd-efgh-jkmn"
  });

  assert.throws(
    () => parseIngestRegisterRequest({
      phone: "18628777821",
      password: "new-password-123",
      confirmPassword: "new-password-123",
      licenseKey: ""
    }),
    /请输入小董AI卡密/
  );
  assert.throws(
    () => parseIngestRegisterRequest({
      phone: "18628777821",
      password: "new-password-123",
      confirmPassword: "different-password",
      licenseKey: "XT-INGEST-ABCD-EFGH-JKMN"
    }),
    /两次输入的密码不一致/
  );
});

test("ingest password reset requires the registered phone and original card", () => {
  assert.deepEqual(parseIngestPasswordResetRequest({
    phone: "186 2877 7821",
    licenseKey: " xt-ingest-abcd-efgh-jkmn ",
    newPassword: "new-password-123",
    confirmPassword: "new-password-123"
  }), {
    phone: "+8618628777821",
    licenseKey: "xt-ingest-abcd-efgh-jkmn",
    newPassword: "new-password-123"
  });

  assert.throws(
    () => parseIngestPasswordResetRequest({
      phone: "18628777821",
      licenseKey: "",
      newPassword: "new-password-123",
      confirmPassword: "new-password-123"
    }),
    /请输入原小董AI卡密/
  );
  assert.throws(
    () => parseIngestPasswordResetRequest({
      phone: "18628777821",
      licenseKey: "XT-INGEST-ABCD-EFGH-JKMN",
      newPassword: "x".repeat(INGEST_PASSWORD_MIN_LENGTH - 1),
      confirmPassword: "x".repeat(INGEST_PASSWORD_MIN_LENGTH - 1)
    }),
    /至少需要/
  );
  assert.throws(
    () => parseIngestPasswordResetRequest({
      phone: "18628777821",
      licenseKey: "XT-INGEST-ABCD-EFGH-JKMN",
      newPassword: "x".repeat(INGEST_PASSWORD_MAX_LENGTH + 1),
      confirmPassword: "x".repeat(INGEST_PASSWORD_MAX_LENGTH + 1)
    }),
    /不能超过/
  );
  assert.throws(
    () => parseIngestPasswordResetRequest({
      phone: "18628777821",
      licenseKey: "XT-INGEST-ABCD-EFGH-JKMN",
      newPassword: "new-password-123",
      confirmPassword: "different-password"
    }),
    /两次输入的新密码不一致/
  );
});

test("ingest account reactivation accepts an original account and a new card", () => {
  assert.deepEqual(parseIngestAccountReactivationRequest({
    phone: "186 2877 7821",
    licenseKey: " xt-user-abcd-efgh-jkmn "
  }), {
    phone: "+8618628777821",
    licenseKey: "xt-user-abcd-efgh-jkmn"
  });

  assert.throws(
    () => parseIngestAccountReactivationRequest({
      phone: "18628777821",
      licenseKey: ""
    }),
    /请输入新小董AI卡密/
  );
});

test("register route activates before session creation and compensates failed activation", () => {
  const route = readFileSync("app/api/ingest/auth/register/route.ts", "utf8");
  const licenseCore = readFileSync("lib/auth/license.ts", "utf8");
  const createIndex = route.indexOf("prisma.user.create");
  const redeemIndex = route.indexOf("await redeemLicenseKey");
  const sessionIndex = route.indexOf("createSession(user.id");

  assert.match(route, /appType !== "user_app" && appType !== "ingest_admin"/);
  assert.match(route, /namespace: "ingest-auth-register-activation"/);
  assert.match(route, /limit: 5/);
  assert.match(route, /isActive: true/);
  assert.doesNotMatch(route, /isActive: false/);
  assert.match(licenseCore, /if \(!activationUser\.isActive\)/);
  assert.match(route, /appType,\s+ip:/);
  assert.match(route, /registrationActivationCompleted/);
  assert.match(route, /prisma\.user\.delete/);
  assert.match(route, /原卡已禁用或过期时，请登录原账号后使用新卡恢复/);
  assert.ok(createIndex >= 0 && redeemIndex > createIndex);
  assert.ok(sessionIndex > redeemIndex, "a login session must only be created after license activation");
  assert.match(route, /redirectTarget: "\/admin-ingest\?app=ingest-admin&platform=web"/);
});

test("ingest reset route verifies the original redeemed card and applies the chosen password", () => {
  const route = readFileSync("app/api/ingest/auth/reset-password/route.ts", "utf8");

  assert.match(route, /appType === "user_app" \|\| appType === "ingest_admin"/);
  assert.match(route, /status: LicenseKeyStatus\.USED/);
  assert.match(route, /license\.redeemedByUserId !== user\.id/);
  assert.match(route, /hasRedeemedLicenseForAppType\(user\.id, appType\)/);
  assert.match(route, /namespace: "ingest-auth-password-reset"/);
  assert.match(route, /limit: 5/);
  assert.match(route, /hashPassword\(input\.newPassword\)/);
  assert.match(route, /prisma\.session\.deleteMany/);
  assert.match(route, /手机号或原小董AI卡密验证失败/);
  assert.doesNotMatch(route, /verifyIngestSmsPasswordResetChallenge|短信验证码/);
  assert.doesNotMatch(route, /123456789|DEFAULT_INGEST_RESET_PASSWORD/);
  assert.doesNotMatch(route, /prisma\.licenseKey\.(?:update|delete)/);
});

test("ingest account reactivation preserves account type and creates a session last", () => {
  const route = readFileSync("app/api/ingest/auth/reactivate-account/route.ts", "utf8");
  const licenseCore = readFileSync("lib/auth/license.ts", "utf8");
  const redeemIndex = route.indexOf("await redeemLicenseKey");
  const sessionIndex = route.indexOf("createSession(account.id");

  assert.match(route, /appType !== "user_app" && appType !== "ingest_admin"/);
  assert.match(route, /hasUserRedeemedLicenseHistoryForAppType\(user\.id, appType\)/);
  assert.match(licenseCore, /hasUserRedeemedLicenseHistoryForAppType[\s\S]*license\.appType === requiredAppType/);
  assert.match(route, /license\.status === LicenseKeyStatus\.UNUSED/);
  assert.match(route, /license\.redeemedByUserId === null/);
  assert.match(route, /license\.expiresAt > now/);
  assert.match(route, /license\.status === LicenseKeyStatus\.USED/);
  assert.match(route, /usedLicense\.redeemedByUserId === user\.id/);
  assert.match(route, /LICENSE_ALREADY_ACTIVATED_MESSAGE/);
  assert.match(route, /new AppError\("LICENSE_USED", message, 409\)/);
  assert.match(route, /error\.code === "LICENSE_ACTIVATION_LIMIT_REACHED"/);
  assert.match(route, /activatedUser\.id !== user\.id/);
  assert.match(route, /nextHistoryScope !== originalHistoryScope/);
  assert.match(route, /access\.accessTier === "none"/);
  assert.match(route, /namespace: "ingest-auth-account-reactivation"/);
  assert.match(route, /limit: 5/);
  assert.match(route, /appType === "user_app"[\s\S]*\? "\/app"[\s\S]*: "\/admin-ingest\?app=ingest-admin&platform=web"/);
  assert.match(route, /setIngestPortalCookie\(appUser, request, access\)/);
  assert.ok(redeemIndex >= 0 && sessionIndex > redeemIndex, "session must be created only after reactivation succeeds");
  assert.doesNotMatch(route, /verifyPassword|passwordHash/);
});

test("ingest auth UI exposes register activation and password recovery only in ingest pages", () => {
  const portal = readFileSync("components/enterprise-admin/IngestSaasAuthPortal.tsx", "utf8");
  const forgotPage = readFileSync("app/ingest/forgot-password/page.tsx", "utf8");
  const reactivatePage = readFileSync("app/ingest/reactivate/page.tsx", "utf8");
  const middleware = readFileSync("middleware.ts", "utf8");

  assert.match(portal, /type IngestAuthMode = "login" \| "register" \| "activate" \| "reset" \| "reactivate"/);
  assert.match(portal, /cta: "注册并激活"/);
  assert.match(portal, /mode !== "register"/);
  assert.match(portal, /mode === "activate" \|\| mode === "register"/);
  assert.match(portal, /\/api\/ingest\/auth\/reset-password/);
  assert.doesNotMatch(portal, /password-reset-code|短信验证码|获取验证码/);
  assert.match(portal, /title: "找回小董AI密码"/);
  assert.match(portal, /cta: "设置新密码"/);
  assert.match(portal, /newPassword: password/);
  assert.match(portal, /confirmPassword/);
  assert.doesNotMatch(portal, /默认密码|123456789/);
  assert.match(portal, /\? "原小董AI卡密"/);
  assert.match(portal, /忘记密码？/);
  assert.match(portal, /import adminIngestLogo from "@\/assets\/admin-ingest\/web-logo\.png"/);
  assert.match(portal, /src=\{adminIngestLogo\}/);
  assert.match(portal, /alt="小董AI投喂端 Logo"/);
  assert.match(portal, /bg-white object-contain/);
  assert.doesNotMatch(portal, /src="\/brand\/xiaodong-ai-logo\.png"/);
  assert.match(portal, /title: "登录小董AI"/);
  assert.match(portal, /title: "找回小董AI密码"/);
  assert.match(portal, /用户端／投喂端卡密/);
  assert.doesNotMatch(portal, /找回投喂端密码|原投喂端卡密/);
  assert.match(portal, /passwordReset=1/);
  assert.match(portal, /\/api\/ingest\/auth\/reactivate-account/);
  assert.match(portal, /使用新卡直接恢复/);
  assert.match(portal, /新小董AI卡密/);
  assert.match(portal, /caughtError\.details\.code === "LICENSE_USED"/);
  assert.match(portal, /caughtError\.message\.includes\("该卡密已经激活"\)/);
  assert.match(portal, /setError\([\s\S]*"该卡密已经激活，请直接登录。"/);
  assert.match(portal, /: "该卡密已经被使用。"/);
  assert.match(portal, /role="alert"/);
  assert.match(portal, /safeNextPath\(data\.redirectTarget \?\? null\)/);
  assert.match(forgotPage, /IngestSaasAuthPortal mode="reset"/);
  assert.match(reactivatePage, /IngestSaasAuthPortal mode="reactivate"/);
  assert.match(middleware, /publicExactPaths[\s\S]*"\/ingest\/forgot-password"/);
  assert.match(middleware, /isSafeNextPath[\s\S]*"\/ingest\/forgot-password"/);
  assert.match(middleware, /publicExactPaths[\s\S]*"\/ingest\/reactivate"/);
  assert.match(middleware, /isSafeNextPath[\s\S]*"\/ingest\/reactivate"/);
});

test("invalid card dialog exposes original-account recovery and isolated new registration", () => {
  const gate = readFileSync("components/enterprise-admin/IngestLicenseInvalidGate.tsx", "utf8");
  const layout = readFileSync("app/admin-ingest/layout.tsx", "utf8");

  assert.match(gate, /使用新卡重新激活/);
  assert.match(gate, /用新手机号和新卡密注册全新账号/);
  assert.match(gate, /新账号不会继承原账号历史/);
  assert.match(gate, /切换账号/);
  assert.match(gate, /注册新账号/);
  assert.match(gate, /const REGISTER_ACCOUNT_HREF = `\/ingest\/register/);
  assert.match(gate, /router\.replace\(REGISTER_ACCOUNT_HREF\)/);
  assert.ok(
    gate.indexOf("使用新卡重新激活") < gate.indexOf("注册新账号"),
    "new-card recovery must remain the primary action before optional registration"
  );
  assert.match(layout, /if \(access\.invalidLicenseCode\) \{[\s\S]*?initialLicenseCode = access\.invalidLicenseCode/);
  assert.match(layout, /<IngestLicenseInvalidGate[\s\S]*?initialCode=\{initialLicenseCode\}/);
  assert.doesNotMatch(layout, /redirect\("\/ingest\/register/);
});
