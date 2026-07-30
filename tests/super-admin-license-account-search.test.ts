import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const serviceSource = readFileSync("lib/super-admin/services/license-admin.service.ts", "utf8");
const clientSource = readFileSync("lib/super-admin/license-admin-client.ts", "utf8");
const dashboardSource = readFileSync("components/super-admin/licenses/LicenseDashboard.tsx", "utf8");
const searchRouteSource = readFileSync(
  "app/api/super-admin/licenses/accounts/route.ts",
  "utf8"
);
const resetRouteSource = readFileSync(
  "app/api/super-admin/licenses/accounts/[id]/reset-password/route.ts",
  "utf8"
);
const accountSearchFunction = serviceSource.slice(
  serviceSource.indexOf("export async function searchSuperAdminLicenseAccounts"),
  serviceSource.indexOf("export async function generateSuperAdminLicenses")
);
const accountResetFunction = serviceSource.slice(
  serviceSource.indexOf("export async function resetSuperAdminLicenseAccountPassword"),
  serviceSource.indexOf("export async function disableSuperAdminLicense")
);
const accountUserUpdate = accountResetFunction.slice(
  accountResetFunction.indexOf("const updatedUser = await transaction.user.update"),
  accountResetFunction.indexOf("const resetAt = new Date()")
);

assert.match(searchRouteSource, /enforceSuperAdminApiAccess\(request\)/);
assert.match(searchRouteSource, /searchSuperAdminLicenseAccounts\(body\)/);
assert.match(resetRouteSource, /enforceSuperAdminApiAccess\(request\)/);
assert.match(resetRouteSource, /resetSuperAdminLicenseAccountPassword/);
assert.match(clientSource, /\/api\/super-admin\/licenses\/accounts/);

assert.match(accountSearchFunction, /prisma\.user\.findMany/);
assert.match(accountSearchFunction, /phone: \{ contains: compactQuery/);
assert.match(accountSearchFunction, /linkedLicenseCount: linkedLicenseCountByUserId\.get\(user\.id\) \?\? 0/);
assert.match(accountSearchFunction, /isBootstrapSuperAdminUser\(user\)/);
assert.match(accountSearchFunction, /resolvedAppType !== appType/);

assert.match(accountResetFunction, /hashPassword\(SUPER_ADMIN_DEFAULT_RESET_PASSWORD\)/);
assert.match(accountResetFunction, /isBootstrapSuperAdminUser\(user\)/);
assert.match(accountResetFunction, /role === "super_admin"/);
assert.match(accountResetFunction, /resolvedAppType !== appType/);
assert.match(accountUserUpdate, /data: \{ passwordHash \}/);
assert.match(accountResetFunction, /action: "reset_user_password"/);
assert.doesNotMatch(accountResetFunction, /licenseKey\.(?:create|update|delete)/);
assert.doesNotMatch(
  accountUserUpdate,
  /\b(?:role|tenantId|licenseActivated|isActive)\b/
);
assert.doesNotMatch(
  accountResetFunction,
  /metadata: \{[\s\S]*?SUPER_ADMIN_DEFAULT_RESET_PASSWORD/
);

assert.match(dashboardSource, /账户搜索结果/);
assert.match(dashboardSource, /未绑定卡密/);
assert.match(dashboardSource, /不会创建或绑定卡密/);
assert.match(dashboardSource, /searchSuperAdminLicenseAccounts/);
assert.match(dashboardSource, /resetSuperAdminLicenseAccountPassword/);

console.log("super admin license account search tests passed");
