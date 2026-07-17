import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const loginPage = readFileSync("app/login/page.tsx", "utf8");
const unactivatedGuard = 'if (role === "user" && !input.licenseActivated)';
const nextPathGuard = "if (\n    input.nextPath &&";

assert.match(loginPage, /if \(role === "user" && !input\.licenseActivated\) \{\s*return "\/unlock";/);
assert.ok(
  loginPage.indexOf(unactivatedGuard) < loginPage.indexOf(nextPathGuard),
  "未激活用户必须在处理 next=/app/chat 前被送往 /unlock"
);
assert.match(loginPage, /\/api\/auth\/user-entry/);
assert.match(loginPage, /!isAdminEntry && !showLicenseEntry/);
assert.match(loginPage, /首次使用或卡密失效？输入卡密/);
assert.match(loginPage, /!isAdminEntry && showLicenseEntry/);
assert.match(loginPage, /填写新的有效用户端卡密重新激活/);
assert.doesNotMatch(loginPage, /没有账号？|去注册|已注册但还没激活？|继续激活/);
assert.match(loginPage, /!isAdminEntry/);

console.log("auth license activation entry tests passed");
