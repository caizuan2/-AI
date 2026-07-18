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
assert.match(loginPage, /首次使用请输入用户名、手机号、密码和用户端卡密/);
assert.match(loginPage, /placeholder="填写网名"/);
assert.match(loginPage, /首次开户时填写；原账号重新激活时可不填写，也不会修改原用户名/);
assert.match(loginPage, /首次使用填写网名和卡密即可直接开户/);
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
assert.match(service, /getRedeemableUserLicense\(licenseKey\)/);
assert.match(service, /redeemLicenseKey\(user\.id, licenseKey/);
assert.match(service, /prisma\.\$transaction/);
assert.match(service, /tx\.user\.create/);
assert.match(service, /throw new ValidationError\("首次使用请填写网名。"\)/);
assert.match(service, /name,\s*isActive: true/);
assert.match(service, /tx\.licenseKey\.updateMany/);
assert.match(service, /status: LicenseKeyStatus\.UNUSED/);
assert.match(service, /redeemedByUserId: null/);
assert.match(service, /mode: "created"/);
assert.match(service, /mode: "reactivated"/);
assert.doesNotMatch(service, /conversation\.(?:delete|deleteMany)|message\.(?:delete|deleteMany)/i);

assert.match(forgotPasswordPage, /fetch\("\/api\/auth\/reset-password"/);
assert.match(resetPasswordRoute, /license\.redeemedByUserId !== user\.id/);
assert.doesNotMatch(resetPasswordRoute, /prisma\.licenseKey\.(?:update|delete)/);

assert.match(electronMain, /mainWindow\.loadURL\(USER_APP_URL\)/);
assert.match(capacitorConfig, /server:\s*\{\s*url: userAppUrl/);

console.log("auth unified user entry tests passed");
