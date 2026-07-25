import { LicenseKeyStatus } from "@prisma/client";

type RedeemedLicenseReuseCandidate = {
  status: LicenseKeyStatus;
  redeemedByUserId: string | null;
  expiresAt: Date | null;
};

export function resolveRedeemedLicenseReuseState(
  license: RedeemedLicenseReuseCandidate,
  userId: string,
  now = new Date()
) {
  if (license.redeemedByUserId !== userId) {
    return "other_user" as const;
  }

  if (license.status === LicenseKeyStatus.DISABLED) {
    return "disabled" as const;
  }

  if (license.status !== LicenseKeyStatus.USED) {
    return "not_active" as const;
  }

  if (license.expiresAt && license.expiresAt <= now) {
    return "expired" as const;
  }

  return "active" as const;
}
