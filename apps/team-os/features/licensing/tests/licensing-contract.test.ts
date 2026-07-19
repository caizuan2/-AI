import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getLicenseAppTypeFromKey,
  isSupportedLicenseKeyInput,
  normalizeLicenseKey
} from "@/lib/auth/license";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

for (const code of [
  "XT-TEAM-ABCD-EFGH-JKLM",
  "XT-TEAM-ABCD-EFGH-JKLM-NPQR"
]) {
  assert.equal(isSupportedLicenseKeyInput(code), true);
  assert.equal(getLicenseAppTypeFromKey(code), "team_os");
}
assert.equal(normalizeLicenseKey(" xt-team-abcd—efgh—jklm—npqr "), "XT-TEAM-ABCD-EFGH-JKLM-NPQR");
assert.equal(getLicenseAppTypeFromKey("XT-USER-ABCD-EFGH-JKLM"), "user_app");
assert.equal(getLicenseAppTypeFromKey("XT-INGEST-ABCD-EFGH-JKLM"), "ingest_admin");

const repositorySource = read("apps/team-os/features/licensing/services/team-os-license-repository.ts");
assert.match(repositorySource, /transaction\.licenseKey\.findMany/);
assert.match(repositorySource, /transaction\.licenseKey\.updateMany/);
assert.match(repositorySource, /targetType:\s*"license_key"/);
assert.match(repositorySource, /action:\s*"redeem_team_os_license_key"/);
assert.match(repositorySource, /transaction\.activationLog\.create/);
assert.doesNotMatch(repositorySource, /team_os_license_grant/);
assert.doesNotMatch(repositorySource, /hashTeamOsLicenseCodeWithSecret/);

const adminServiceSource = read("lib/super-admin/services/license-admin.service.ts");
assert.match(adminServiceSource, /"user_app",\s*"ingest_admin",\s*"team_os"/);
assert.match(adminServiceSource, /return "XT-TEAM"/);
assert.match(adminServiceSource, /generate_team_os_license_key/);
assert.match(adminServiceSource, /renewSuperAdminLicense/);
assert.match(adminServiceSource, /activationLog\.findMany/);

const sharedLicenseSource = read("lib/auth/license.ts");
assert.match(sharedLicenseSource, /hasRedeemedLicenseForAppType/);
assert.match(sharedLicenseSource, /team_os_license_requires_company_activation/);
assert.doesNotMatch(sharedLicenseSource, /getLatestRedeemedLicenseAppType/);

const activationSource = read("apps/team-os/features/onboarding/services/company-activation.ts");
assert.match(activationSource, /role:\s*"TEAM_OWNER"/);
assert.match(activationSource, /attachTeamOsSubscriptionToLicense/);
assert.doesNotMatch(activationSource, /licenseActivated:\s*true/);
assert.doesNotMatch(activationSource, /tenantId:\s*company/);

const legacyPageSource = read("app/team-os/platform/licenses/page.tsx");
assert.match(legacyPageSource, /redirect\("\/super-admin\/licenses\/team-os"\)/);

console.log("AI Team OS unified LicenseKey contract tests passed.");
