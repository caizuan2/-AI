import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const serviceSource = readFileSync("lib/super-admin/services/license-admin.service.ts", "utf8");
const clientSource = readFileSync("lib/super-admin/license-admin-client.ts", "utf8");
const dashboardSource = readFileSync("components/super-admin/licenses/LicenseDashboard.tsx", "utf8");
const routeSource = readFileSync(
  "app/api/super-admin/licenses/[id]/reset-password/route.ts",
  "utf8"
);
const typesSource = readFileSync("types/super-admin-licenses.ts", "utf8");
const resetFunction = serviceSource.slice(
  serviceSource.indexOf("export async function resetSuperAdminLicenseUserPassword"),
  serviceSource.indexOf("export async function disableSuperAdminLicense")
);

assert.match(typesSource, /SUPER_ADMIN_DEFAULT_RESET_PASSWORD = "123456789"/);
assert.match(routeSource, /enforceSuperAdminApiAccess\(request\)/);
assert.match(routeSource, /resetSuperAdminLicenseUserPassword\(actor, context\.params\.id, request\)/);
assert.match(clientSource, /\/reset-password/);

assert.match(resetFunction, /hashPassword\(SUPER_ADMIN_DEFAULT_RESET_PASSWORD\)/);
assert.match(resetFunction, /redeemedByUserId/);
assert.match(resetFunction, /GENERATABLE_LICENSE_APP_TYPES\.includes/);
assert.match(resetFunction, /transaction\.user\.update/);
assert.match(resetFunction, /data: \{ passwordHash \}/);
assert.match(resetFunction, /action: "reset_license_user_password"/);
assert.doesNotMatch(resetFunction, /licenseKey\.(?:update|delete)/);
assert.doesNotMatch(
  resetFunction,
  /data: \{[\s\S]*?\b(?:role|tenantId|licenseActivated|isActive)\b/
);
assert.doesNotMatch(
  resetFunction,
  /metadata: \{[\s\S]*?SUPER_ADMIN_DEFAULT_RESET_PASSWORD/
);

assert.match(serviceSource, /\{ phone: \{ contains: query, mode: "insensitive" \} \}/);
assert.match(dashboardSource, /搜索卡密 \/ 手机号 \/ 激活用户 \/ 账号/);
assert.match(dashboardSource, /license\.redeemedByUserId \? \(/);
assert.match(dashboardSource, /: "重置密码"/);
assert.match(dashboardSource, /window\.confirm/);
assert.match(dashboardSource, /不会改变卡密状态、角色、企业或历史数据/);
assert.match(dashboardSource, /登录后尽快修改/);

console.log("super admin license password reset tests passed");
