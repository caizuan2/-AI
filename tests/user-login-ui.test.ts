import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getUserEntryErrorFeedback,
  readUserEntryErrorMessage
} from "../app/login/user-entry-feedback";

const loginPage = readFileSync("app/login/page.tsx", "utf8");

test("首次开户缺少网名时显示字段提示并定位网名输入框", () => {
  const feedback = getUserEntryErrorFeedback({
    code: "VALIDATION_ERROR",
    status: 400,
    message: "这是新手机号，首次开户请填写网名。"
  });

  assert.deepEqual(feedback, {
    message: "这是新手机号，首次开户请填写网名。",
    nameError: "这是新手机号，首次开户请填写网名。",
    revealLicenseEntry: true
  });
  assert.match(loginPage, /网名（首次开户必填，原账号换卡恢复可不填）/);
  assert.match(loginPage, /id="login-name-error"/);
  assert.match(loginPage, /nameFieldRef\.current\?\.scrollIntoView/);
  assert.match(loginPage, /nameInputRef\.current\?\.focus/);
});

test("原账号换卡恢复允许空网名交给后端判断", () => {
  assert.match(loginPage, /!isAdminEntry && showLicenseEntry \? \{ name \} : \{\}/);
  assert.doesNotMatch(loginPage, /if\s*\(\s*!name\.trim\(\)/);
  assert.doesNotMatch(loginPage, /required=\{?true\}?[^>]*id="login-name"/);
  assert.match(loginPage, /原账号使用新卡恢复时留空即可，不会修改原网名/);
});

test("卡密错误全部映射为可理解的中文", () => {
  const cases = [
    ["LICENSE_USED", "这张卡密已经绑定其他账号，请更换新的未使用卡密。"],
    ["LICENSE_ALREADY_USED", "这张卡密已经绑定其他账号，请更换新的未使用卡密。"],
    ["LICENSE_ACTIVATION_LIMIT_REACHED", "这张卡密已经绑定其他账号，请更换新的未使用卡密。"],
    ["LICENSE_DISABLED", "当前卡密已被禁用，请联系管理员获取新卡密。"],
    ["LICENSE_EXPIRED", "当前卡密已过期，请联系管理员续期或更换卡密。"],
    ["INVALID_LICENSE_KEY", "卡密不存在或格式不正确，请检查后重新输入。"],
    ["LICENSE_NOT_FOUND", "卡密不存在或格式不正确，请检查后重新输入。"],
    ["LICENSE_APP_TYPE_MISMATCH", "该卡密不适用于用户端，请使用 XT-USER 用户端卡密。"]
  ] as const;

  for (const [code, message] of cases) {
    assert.equal(getUserEntryErrorFeedback({ code, status: 403 }).message, message);
  }
});

test("网络错误和服务端错误稳定降级且不会抛出导致白屏", () => {
  assert.doesNotThrow(() => getUserEntryErrorFeedback({ networkError: true }));
  assert.doesNotThrow(() => getUserEntryErrorFeedback({ code: 500, message: { internal: true } }));
  assert.equal(
    getUserEntryErrorFeedback({ networkError: true }).message,
    "服务暂时不可用，请稍后重试。"
  );
  assert.equal(
    getUserEntryErrorFeedback({ code: "DATABASE_ERROR", status: 500, message: "database failed" }).message,
    "服务暂时不可用，请稍后重试。"
  );
  assert.equal(
    getUserEntryErrorFeedback({ code: "UNKNOWN_ERROR", status: 400, message: "internal details" }).message,
    "请求处理失败，请检查输入后重试。"
  );
  assert.match(loginPage, /else if \(!isAdminEntry\) \{\s*setError\(getUserEntryErrorFeedback\(\{ networkError: true \}\)\.message\)/);
  assert.match(loginPage, /role="alert"/);
});

test("API 原始错误与技术信息分层展示", () => {
  assert.equal(
    readUserEntryErrorMessage({
      message: "根级消息",
      error: {
        message: "首次开户请填写网名。"
      }
    }),
    "首次开户请填写网名。"
  );
  assert.match(loginPage, /readUserEntryErrorMessage\(caughtError\.details\.body\)/);
  assert.match(loginPage, /<details className="mt-2 text-xs text-rose-600">/);
  assert.match(loginPage, /查看技术信息/);
  assert.match(loginPage, /错误码：\{technicalError\.code\}/);
  assert.match(loginPage, /请求 ID：\{technicalError\.requestId\}/);
});

test("请求失败保留全部输入内容", () => {
  const catchStart = loginPage.indexOf("} catch (caughtError) {");
  const finallyStart = loginPage.indexOf("} finally {", catchStart);

  assert.notEqual(catchStart, -1);
  assert.notEqual(finallyStart, -1);

  const failureBlock = loginPage.slice(catchStart, finallyStart);

  assert.doesNotMatch(failureBlock, /\bsetPhone\(\s*""/);
  assert.doesNotMatch(failureBlock, /\bsetPassword\(\s*""/);
  assert.doesNotMatch(failureBlock, /\bsetName\(\s*""/);
  assert.doesNotMatch(failureBlock, /\bsetLicenseKey\(\s*""/);
});

test("loading 和同步提交锁共同阻止重复提交并在结束后恢复", () => {
  assert.match(loginPage, /if \(loading \|\| submittingRef\.current\) \{\s*return;/);
  assert.match(loginPage, /submittingRef\.current = true;\s*setLoading\(true\)/);
  assert.match(loginPage, /finally \{\s*submittingRef\.current = false;\s*setLoading\(false\)/);
  assert.match(loginPage, /disabled=\{loading\}/);
  assert.match(loginPage, /aria-busy=\{loading\}/);
  assert.match(loginPage, /loading \? "正在登录\.\.\." : "登录"/);
});

console.log("user login UI tests passed");
