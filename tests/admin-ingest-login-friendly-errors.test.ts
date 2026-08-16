import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getIngestLoginErrorMessage } from "../lib/enterprise/ingest-login-error";

test("ingest login distinguishes account and password failures", () => {
  const route = readFileSync("app/api/ingest/auth/login/route.ts", "utf8");

  assert.match(route, /if \(!user\) \{[\s\S]*?UnauthorizedError\("账号错误。"\)/);
  assert.match(route, /verifyPassword\(input\.password, user\.passwordHash\)[\s\S]*?UnauthorizedError\("密码错误。"\)/);
  assert.doesNotMatch(route, /UnauthorizedError\("手机号或密码错误。"\)/);
});

test("ingest login hides API codes and request ids from visible errors", () => {
  const accountError = {
    message: "请求处理失败：账号错误。\n错误码：UNAUTHORIZED\n请求ID：request-1",
    details: {
      code: "UNAUTHORIZED",
      requestId: "request-1",
      body: {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "账号错误。",
          requestId: "request-1"
        }
      }
    }
  };
  const passwordError = {
    message: "请求处理失败：密码错误。\n错误码：UNAUTHORIZED\n请求ID：request-2",
    details: {
      body: {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "密码错误。"
        }
      }
    }
  };

  assert.equal(getIngestLoginErrorMessage(accountError), "账号错误。");
  assert.equal(getIngestLoginErrorMessage(passwordError), "密码错误。");
  assert.equal(getIngestLoginErrorMessage(new Error("Failed to fetch")), "网络连接失败，请稍后重试。");
  assert.equal(getIngestLoginErrorMessage(new Error("UNAUTHORIZED")), "账号或密码错误。");

  for (const message of [getIngestLoginErrorMessage(accountError), getIngestLoginErrorMessage(passwordError)]) {
    assert.doesNotMatch(message, /请求处理失败|错误码|请求ID|UNAUTHORIZED|request-/);
  }
});

test("only the ingest login mode uses the public login error mapper", () => {
  const portal = readFileSync("components/enterprise-admin/IngestSaasAuthPortal.tsx", "utf8");

  assert.match(portal, /mode === "login"[\s\S]*?getIngestLoginErrorMessage\(caughtError\)/);
  assert.match(portal, /import \{ getIngestLoginErrorMessage \} from "@\/lib\/enterprise\/ingest-login-error"/);
});
