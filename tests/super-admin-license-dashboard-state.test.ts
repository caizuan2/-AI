import assert from "node:assert/strict";
import {
  applyLicenseRecordUpdate,
  groupLicenseActivationRecords,
  replaceLicenseRecord
} from "../components/super-admin/licenses/LicenseDashboard";
import type {
  SuperAdminLicenseActivationRecord,
  SuperAdminLicenseDashboardData,
  SuperAdminLicenseRecord
} from "../types/super-admin-licenses";

function license(input: Partial<SuperAdminLicenseRecord> = {}): SuperAdminLicenseRecord {
  return {
    id: input.id ?? "license-1",
    displayKey: input.displayKey ?? "HASH-TEST0001",
    canReveal: input.canReveal ?? false,
    appType: input.appType ?? "user_app",
    plan: input.plan ?? "pro",
    status: input.status ?? "UNUSED",
    tenantId: input.tenantId ?? null,
    note: input.note ?? null,
    maxActivations: input.maxActivations ?? 1,
    activationCount: input.activationCount ?? 0,
    createdAt: input.createdAt ?? "2026-07-18T00:00:00.000Z",
    expiresAt: input.expiresAt ?? "2026-08-18T00:00:00.000Z",
    activatedAt: input.activatedAt ?? null,
    redeemedAt: input.redeemedAt ?? null,
    redeemedByUserId: input.redeemedByUserId ?? null,
    redeemedByUserLabel: input.redeemedByUserLabel ?? null,
    redeemedByUserAccount: input.redeemedByUserAccount ?? null,
    teamOsCompanyId: input.teamOsCompanyId ?? null,
    teamOsTeamId: input.teamOsTeamId ?? null,
    subscriptionDays: input.subscriptionDays ?? null,
    subscriptionEndsAt: input.subscriptionEndsAt ?? null
  };
}

const untouchedLicense = license({ id: "license-2", status: "USED" });
const originalLicense = license();
const disabledLicense = license({ status: "DISABLED" });
const data: SuperAdminLicenseDashboardData = {
  summary: {
    total: 2,
    unused: 1,
    used: 1,
    disabled: 0,
    expiringSoon: 2,
    byAppType: {
      user_app: 2,
      ingest_admin: 0,
      team_os: 0,
      super_admin: 0
    }
  },
  licenses: [originalLicense, untouchedLicense],
  activations: [],
  audit: []
};

const updatedData = applyLicenseRecordUpdate(data, disabledLicense);

assert.equal(updatedData.licenses[0]?.status, "DISABLED");
assert.equal(updatedData.licenses[1], untouchedLicense);
assert.equal(updatedData.summary.total, 2);
assert.equal(updatedData.summary.unused, 0);
assert.equal(updatedData.summary.used, 1);
assert.equal(updatedData.summary.disabled, 1);
assert.equal(updatedData.summary.expiringSoon, 2);
assert.deepEqual(updatedData.summary.byAppType, data.summary.byAppType);

const searchedLicenses = replaceLicenseRecord([originalLicense], disabledLicense);
assert.equal(searchedLicenses.length, 1);
assert.equal(searchedLicenses[0]?.status, "DISABLED");

function activation(input: Partial<SuperAdminLicenseActivationRecord>): SuperAdminLicenseActivationRecord {
  return {
    id: input.id ?? "activation-1",
    licenseId: input.licenseId ?? "license-1",
    displayKey: input.displayKey ?? "HASH-TEST0001",
    appType: input.appType ?? "user_app",
    userId: input.userId ?? "user-1",
    success: input.success ?? false,
    message: input.message ?? "卡密已使用。",
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    createdAt: input.createdAt ?? "2026-07-19T13:13:00.000Z"
  };
}

const groupedActivations = groupLicenseActivationRecords([
  activation({ id: "activation-3", createdAt: "2026-07-19T13:14:30.000Z" }),
  activation({ id: "activation-2", createdAt: "2026-07-19T13:13:30.000Z" }),
  activation({ id: "activation-1", createdAt: "2026-07-19T13:13:00.000Z" }),
  activation({
    id: "activation-success",
    success: true,
    message: "激活成功。",
    createdAt: "2026-07-19T13:12:30.000Z"
  }),
  activation({ id: "activation-old", createdAt: "2026-07-19T12:00:00.000Z" })
]);

assert.equal(groupedActivations.length, 3);
assert.equal(groupedActivations[0]?.id, "activation-3");
assert.equal(groupedActivations[0]?.repeatCount, 3);
assert.equal(groupedActivations[0]?.firstCreatedAt, "2026-07-19T13:13:00.000Z");
assert.equal(groupedActivations[0]?.lastCreatedAt, "2026-07-19T13:14:30.000Z");
assert.equal(groupedActivations[1]?.success, true);
assert.equal(groupedActivations[2]?.repeatCount, 1);

console.log("super admin license dashboard state tests passed");
