import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const loginPage = readFileSync("app/login/page.tsx", "utf8");
const registerPage = readFileSync("app/register/page.tsx", "utf8");
const route = readFileSync("app/api/auth/user-entry/route.ts", "utf8");
const service = readFileSync("lib/auth/user-entry.ts", "utf8");
const forgotPasswordPage = readFileSync("app/forgot-password/page.tsx", "utf8");
const resetPasswordRoute = readFileSync("app/api/auth/reset-password/route.ts", "utf8");
const electronMain = readFileSync("electron/main.cjs", "utf8");
const capacitorConfig = readFileSync("capacitor.config.ts", "utf8");

assert.match(loginPage, /isAdminEntry \? "\/api\/auth\/login" : "\/api\/auth\/user-entry"/);
assert.match(loginPage, /licenseKey/);
assert.match(loginPage, /首次使用请输入手机号、密码和用户端卡密，系统会自动判断是否为新账号；新账号还需填写网名/);
assert.match(loginPage, /placeholder="填写网名"/);
assert.match(loginPage, /网名（首次开户必填，原账号换卡恢复可不填）/);
assert.match(loginPage, /新账号首次开户时填写；原账号使用新卡恢复时留空即可，不会修改原网名/);
assert.match(loginPage, /首次开户填写网名和卡密；原账号换卡恢复时网名可留空，并保留聊天记录/);
assert.match(loginPage, /!isAdminEntry && showLicenseEntry \? \{ name \} : \{\}/);
assert.match(loginPage, /useState\(firstUse \|\| activationRequested\)/);
assert.match(loginPage, /!isAdminEntry && !showLicenseEntry/);
assert.match(loginPage, /首次使用或卡密失效？输入卡密/);
assert.match(loginPage, /!isAdminEntry && showLicenseEntry/);
assert.match(loginPage, /setShowLicenseEntry\(true\)/);
assert.match(loginPage, /LICENSE_REQUIRED/);
assert.match(loginPage, /LICENSE_DISABLED/);
assert.match(loginPage, /LICENSE_EXPIRED/);
assert.match(loginPage, /忘记密码？/);
assert.doesNotMatch(loginPage, /没有账号？|去注册|继续激活/);
assert.match(registerPage, /redirect\("\/login\?first=1"\)/);

assert.match(route, /checkPersistentRateLimit/);
assert.match(route, /namespace: "auth-user-entry"/);
assert.match(route, /enterUserApp/);
assert.match(route, /const name = typeof body\.name === "string" \? body\.name\.trim\(\) : ""/);
assert.match(route, /role !== "user" \|\| !hasUserClientAccess\(accessProfile\)/);
assert.ok(
  route.indexOf("getUserAccessProfile") < route.indexOf("await createSession"),
  "the session must only be created after user-app access is confirmed"
);

assert.match(service, /prisma\.user\.findUnique/);
assert.match(service, /verifyPassword\(password, user\.passwordHash\)/);
assert.match(service, /user\.role !== "user"/);
assert.match(service, /getUserLicenseState\(user\)/);
assert.match(service, /const redeemableLicense = await getRedeemableUserLicense\(licenseKey\)/);
assert.match(service, /redeemLicenseKey\(user\.id, redeemableLicense\.normalizedKey/);
assert.match(service, /prisma\.\$transaction/);
assert.match(service, /tx\.user\.create/);
assert.match(service, /这是新手机号，首次开户请填写网名/);
assert.match(service, /恢复已禁用卡密的原账号/);
assert.match(service, /name,\s*isActive: true/);
assert.match(service, /tx\.licenseKey\.updateMany/);
assert.match(service, /status: LicenseKeyStatus\.UNUSED/);
assert.match(service, /redeemedByUserId: null/);
assert.match(service, /mode: "created"/);
assert.match(service, /mode: "reactivated"/);
assert.ok(
  service.indexOf("if (existingUser)") < service.indexOf("return createUserWithLicense"),
  "已有账号必须优先进入登录或换新卡恢复流程，不能被当成首次开户"
);
assert.doesNotMatch(service, /conversation\.(?:delete|deleteMany)|message\.(?:delete|deleteMany)/i);

assert.match(forgotPasswordPage, /fetch\("\/api\/auth\/reset-password"/);
assert.match(resetPasswordRoute, /license\.redeemedByUserId !== user\.id/);
assert.doesNotMatch(resetPasswordRoute, /prisma\.licenseKey\.(?:update|delete)/);

assert.match(electronMain, /mainWindow\.loadURL\(USER_APP_URL\)/);
assert.match(capacitorConfig, /server:\s*\{\s*url: userAppUrl/);

console.log("auth unified user entry tests passed");
