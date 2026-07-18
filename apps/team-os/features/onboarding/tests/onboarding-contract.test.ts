import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isTeamOsInvitationCode,
  maskInvitationEmail,
  parseActivateTeamOsCompanyInput,
  parseTeamOsRegisterInput,
  parseTeamOsInvitationCode
} from "@/apps/team-os/features/onboarding/utils/onboarding-input";

const registration = parseTeamOsRegisterInput({
  name: " 张三 ",
  phone: "138 0013 8000",
  email: " Owner@Example.COM ",
  password: "secure-pass-123"
});
assert.deepEqual(registration, {
  name: "张三",
  phone: "+8613800138000",
  email: "owner@example.com",
  password: "secure-pass-123"
});
assert.throws(() => parseTeamOsRegisterInput({ name: "张三", phone: "123", email: "bad", password: "short" }));

const activation = parseActivateTeamOsCompanyInput({
  code: " XT-TEAM-ABCD-EFGH-IJKL-MNOP ",
  companyName: " 示例企业 ",
  industry: " 企业服务 "
});
assert.equal(activation.companyName, "示例企业");
assert.equal(activation.industry, "企业服务");

const invitationCode = "abcdefghijklmnopqrstuvwxABCDEFGH";
assert.equal(parseTeamOsInvitationCode(invitationCode), invitationCode);
assert.equal(isTeamOsInvitationCode(invitationCode), true);
assert.equal(isTeamOsInvitationCode("bad/code"), false);
assert.equal(maskInvitationEmail("employee@example.com"), "em******@e***.com");

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const registrationSource = source("apps/team-os/features/onboarding/services/registration-service.ts");
assert.match(registrationSource, /checkRegistrationSchema/);
assert.doesNotMatch(registrationSource, /ensureRegistrationSchema/);
assert.match(registrationSource, /licenseActivated:\s*false/);
assert.doesNotMatch(registrationSource, /licenseActivated:\s*true/);
assert.doesNotMatch(registrationSource, /tenantId\s*:/);

const activationSource = source("apps/team-os/features/onboarding/services/company-activation.ts");
assert.match(activationSource, /consumeTeamOsLicenseGrantInTransaction/);
assert.match(activationSource, /TransactionIsolationLevel\.Serializable/);
assert.match(activationSource, /role:\s*"TEAM_OWNER"/);
assert.match(activationSource, /tenantSubscription\.create/);
assert.match(activationSource, /`team-os:\$\{userId\}`/);
assert.match(activationSource, /legacyOwnerMembership/);
assert.match(activationSource, /activeCompanyMembers\.length > plan\.maxUsers/);
assert.doesNotMatch(activationSource, /transaction\.user\.update/);

const invitationSource = source("apps/team-os/features/onboarding/services/invitation-repository.ts");
assert.match(invitationSource, /isInvitationRole/);
assert.match(invitationSource, /companyId !== invitation\.team\.companyId/);
assert.match(invitationSource, /subscription\.plan\.maxUsers/);
assert.match(invitationSource, /data:\s*\{ email: normalizedInvitationEmail \}/);

const organizationSource = source("apps/team-os/features/organization/services/organization-repository.ts");
assert.match(organizationSource, /if \(!pendingInvitation\)/);
assert.match(organizationSource, /otherCompanyMembership/);
assert.match(organizationSource, /tenantSubscription\.findFirst/);
assert.match(organizationSource, /activeCompanyMembers\.length >= subscription\.plan\.maxUsers/);

console.log("AI Team OS onboarding contract checks passed.");
