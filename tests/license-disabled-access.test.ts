import assert from "node:assert/strict";
import Module from "node:module";
import { LicenseKeyStatus } from "@prisma/client";
import type { RedeemedLicenseState } from "../lib/auth/license";

const moduleLoader = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleLoader._load;

moduleLoader._load = (request, parent, isMain) => {
  if (request === "server-only") {
    return {};
  }

  return originalLoad(request, parent, isMain);
};

const { resolveRedeemedLicenseAccessState } = require("../lib/auth/license") as typeof import("../lib/auth/license");
moduleLoader._load = originalLoad;

const now = new Date("2026-07-16T12:00:00.000Z");

function license(input: Partial<RedeemedLicenseState> = {}): RedeemedLicenseState {
  return {
    id: input.id ?? "license-1",
    status: input.status ?? LicenseKeyStatus.USED,
    expiresAt: input.expiresAt ?? new Date("2026-08-16T12:00:00.000Z"),
    appType: input.appType ?? "user_app"
  };
}

assert.equal(resolveRedeemedLicenseAccessState([license()], "user_app", now).state, "active");
assert.equal(
  resolveRedeemedLicenseAccessState([license({ status: LicenseKeyStatus.DISABLED })], "user_app", now).state,
  "disabled"
);
assert.equal(
  resolveRedeemedLicenseAccessState([license({ expiresAt: new Date("2026-07-15T12:00:00.000Z") })], "user_app", now)
    .state,
  "expired"
);
assert.equal(
  resolveRedeemedLicenseAccessState([license({ appType: "ingest_admin" })], "user_app", now).state,
  "mismatch"
);
assert.equal(resolveRedeemedLicenseAccessState([], "user_app", now).state, "missing");
assert.equal(
  resolveRedeemedLicenseAccessState(
    [
      license({ id: "disabled", status: LicenseKeyStatus.DISABLED }),
      license({ id: "active" })
    ],
    "user_app",
    now
  ).state,
  "active"
);

console.log("license disabled access tests passed");
