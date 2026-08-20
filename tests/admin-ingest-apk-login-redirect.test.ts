import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import {
  buildAdminIngestPublicRedirectUrl,
  resolveAdminIngestPublicOrigin
} from "../lib/enterprise/admin-ingest-redirect-origin";

const internalRequestUrl =
  "http://localhost:3021/admin-ingest?app=ingest-admin&platform=apk";

const publicHeaders = new Headers({
  host: "47.238.0.23",
  "x-forwarded-proto": "http"
});

assert.equal(
  resolveAdminIngestPublicOrigin({
    url: internalRequestUrl,
    headers: publicHeaders
  }),
  "http://47.238.0.23"
);

assert.equal(
  buildAdminIngestPublicRedirectUrl(
    { url: internalRequestUrl, headers: publicHeaders },
    "/ingest/activate"
  ).toString(),
  "http://47.238.0.23/ingest/activate"
);

assert.equal(
  resolveAdminIngestPublicOrigin({
    url: internalRequestUrl,
    headers: new Headers({
      host: "47.238.0.23",
      "x-forwarded-host": "knowledge.example.com:8443",
      "x-forwarded-proto": "https"
    })
  }),
  "https://knowledge.example.com:8443"
);

assert.equal(
  resolveAdminIngestPublicOrigin({
    url: internalRequestUrl,
    headers: new Headers({
      host: "47.238.0.23",
      "x-forwarded-host": "attacker.example/path",
      "x-forwarded-proto": "https"
    })
  }),
  "https://47.238.0.23",
  "invalid forwarded hosts must not control the redirect origin"
);

assert.equal(
  resolveAdminIngestPublicOrigin({
    url: "http://localhost:3000/admin-ingest",
    headers: new Headers({ host: "localhost:3000" })
  }),
  "http://localhost:3000",
  "local development must retain its own host and port"
);

const middlewareSource = readFileSync("middleware.ts", "utf8");
const loginRedirectBlock = middlewareSource.slice(
  middlewareSource.indexOf("function redirectToIngestLogin"),
  middlewareSource.indexOf("function redirectToIngestActivate")
);
const activateRedirectBlock = middlewareSource.slice(
  middlewareSource.indexOf("function redirectToIngestActivate"),
  middlewareSource.indexOf("function apiAuthError")
);

assert.match(loginRedirectBlock, /buildAdminIngestPublicRedirectUrl\(request, "\/ingest\/login"\)/);
assert.match(activateRedirectBlock, /buildAdminIngestPublicRedirectUrl\(request, "\/ingest\/activate"\)/);
assert.doesNotMatch(loginRedirectBlock, /request\.nextUrl\.clone\(\)/);
assert.doesNotMatch(activateRedirectBlock, /request\.nextUrl\.clone\(\)/);

async function main() {
  const redirectResponse = await middleware(
    new NextRequest(internalRequestUrl, {
      headers: publicHeaders
    })
  );
  const location = redirectResponse.headers.get("location");

  assert.equal(redirectResponse.status, 307);
  assert.ok(location);

  const redirectUrl = new URL(location);
  assert.equal(redirectUrl.origin, "http://47.238.0.23");
  assert.equal(redirectUrl.pathname, "/ingest/login");
  assert.equal(
    redirectUrl.searchParams.get("next"),
    "/admin-ingest?app=ingest-admin&platform=apk"
  );
  assert.doesNotMatch(location, /localhost:3021/);

  console.log("Admin-ingest APK public login redirect tests passed.");
}

void main();
