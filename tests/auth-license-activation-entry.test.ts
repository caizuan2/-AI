import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const loginPage = readFileSync("app/login/page.tsx", "utf8");
const unactivatedGuard = 'if (role === "user" && !input.licenseActivated)';
const nextPathGuard = "input.nextPath &&";

assert.match(loginPage, /if \(role === "user" && !input\.licenseActivated\) \{\s*return "\/unlock";/);
assert.ok(
  loginPage.indexOf(unactivatedGuard) < loginPage.indexOf(nextPathGuard),
  "未激活用户必须在处理 next=/app/chat 前被送往 /unlock"
);
assert.match(loginPage, /\/login\?next=%2Funlock&activation=1/);
assert.match(loginPage, /已注册但还没激活？/);
assert.match(loginPage, /请登录已经注册的账号，登录后即可继续输入卡密激活。/);
assert.match(loginPage, /!isAdminEntry/);

console.log("auth license activation entry tests passed");
