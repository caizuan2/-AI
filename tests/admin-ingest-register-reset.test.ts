import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  INGEST_PASSWORD_MAX_LENGTH,
  INGEST_PASSWORD_MIN_LENGTH,
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

test("ingest password reset validates the original card and matching new password", () => {
  assert.deepEqual(parseIngestPasswordResetRequest({
    phone: "186 2877 7821",
    licenseKey: " xt-ingest-abcd-efgh-jkmn ",
    newPassword: "replacement-password-123",
    confirmPassword: "replacement-password-123"
  }), {
    phone: "+8618628777821",
    licenseKey: "xt-ingest-abcd-efgh-jkmn",
    newPassword: "replacement-password-123"
  });

  assert.throws(
    () => parseIngestPasswordResetRequest({
      phone: "18628777821",
      licenseKey: "",
      newPassword: "replacement-password-123",
      confirmPassword: "replacement-password-123"
    }),
    /请输入小董AI卡密/
  );
  assert.throws(
    () => parseIngestPasswordResetRequest({
      phone: "18628777821",
      licenseKey: "XT-INGEST-ABCD-EFGH-JKMN",
      newPassword: "short",
      confirmPassword: "short"
    }),
    new RegExp(`至少需要 ${INGEST_PASSWORD_MIN_LENGTH} 位`)
  );
  assert.throws(
    () => parseIngestPasswordResetRequest({
      phone: "18628777821",
      licenseKey: "XT-INGEST-ABCD-EFGH-JKMN",
      newPassword: "a".repeat(INGEST_PASSWORD_MAX_LENGTH + 1),
      confirmPassword: "a".repeat(INGEST_PASSWORD_MAX_LENGTH + 1)
    }),
    new RegExp(`不能超过 ${INGEST_PASSWORD_MAX_LENGTH} 位`)
  );
  assert.throws(
    () => parseIngestPasswordResetRequest({
      phone: "18628777821",
      licenseKey: "XT-INGEST-ABCD-EFGH-JKMN",
      newPassword: "replacement-password-123",
      confirmPassword: "different-password"
    }),
    /两次输入的新密码不一致/
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

test("ingest reset route accepts the bound active user or ingest card", () => {
  const route = readFileSync("app/api/ingest/auth/reset-password/route.ts", "utf8");

  assert.match(route, /appType === "user_app" \|\| appType === "ingest_admin"/);
  assert.match(route, /status: LicenseKeyStatus\.USED/);
  assert.match(route, /license\.redeemedByUserId !== user\.id/);
  assert.match(route, /hasRedeemedLicenseForAppType\(user\.id, appType\)/);
  assert.match(route, /namespace: "ingest-auth-password-reset"/);
  assert.match(route, /limit: 5/);
  assert.match(route, /passwordHash/);
  assert.match(route, /prisma\.session\.deleteMany/);
  assert.match(route, /手机号或小董AI卡密验证失败/);
  assert.doesNotMatch(route, /prisma\.licenseKey\.(?:update|delete)/);
});

test("ingest auth UI exposes register activation and password recovery only in ingest pages", () => {
  const portal = readFileSync("components/enterprise-admin/IngestSaasAuthPortal.tsx", "utf8");
  const forgotPage = readFileSync("app/ingest/forgot-password/page.tsx", "utf8");
  const middleware = readFileSync("middleware.ts", "utf8");

  assert.match(portal, /type IngestAuthMode = "login" \| "register" \| "activate" \| "reset"/);
  assert.match(portal, /cta: "注册并激活"/);
  assert.match(portal, /mode !== "register"/);
  assert.match(portal, /mode === "activate" \|\| mode === "register" \|\| mode === "reset"/);
  assert.match(portal, /\/api\/ingest\/auth\/reset-password/);
  assert.match(portal, /忘记密码？/);
  assert.match(portal, /import adminIngestLogo from "@\/assets\/admin-ingest\/web-logo\.png"/);
  assert.match(portal, /src=\{adminIngestLogo\}/);
  assert.match(portal, /alt="小董AI投喂端 Logo"/);
  assert.match(portal, /bg-white object-contain/);
  assert.doesNotMatch(portal, /src="\/brand\/xiaodong-ai-logo\.png"/);
  assert.match(portal, /title: "登录小董AI"/);
  assert.match(portal, /title: "找回小董AI密码"/);
  assert.match(portal, /原小董AI卡密/);
  assert.match(portal, /用户端／投喂端卡密/);
  assert.doesNotMatch(portal, /找回投喂端密码|原投喂端卡密/);
  assert.match(portal, /passwordReset=1/);
  assert.match(forgotPage, /IngestSaasAuthPortal mode="reset"/);
  assert.match(middleware, /publicExactPaths[\s\S]*"\/ingest\/forgot-password"/);
  assert.match(middleware, /isSafeNextPath[\s\S]*"\/ingest\/forgot-password"/);
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
