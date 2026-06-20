import type { LicenseInfo } from "@/types/super-admin";

const licenseSummary: LicenseInfo = {
  activated: 2974,
  expiringSoon: 37,
  pendingPolicies: 6,
  utilizationRate: "85.4%"
};

export function getLicenseSummary(): LicenseInfo {
  return licenseSummary;
}

export function getExpiringLicenseCount() {
  return licenseSummary.expiringSoon;
}
