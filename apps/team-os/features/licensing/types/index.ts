export type TeamOsLicenseStatus = "UNUSED" | "USED" | "REVOKED" | "EXPIRED";

export interface TeamOsLicensePlan {
  id: string;
  name: string;
  description: string;
  maxUsers: number;
  maxStorage: number;
  features: string[];
  price: string;
  status: "ACTIVE" | "DISABLED";
}

export interface TeamOsLicenseGrant {
  codeHash: string;
  grantId: string;
  planId: string;
  planName: string;
  subscriptionDays: number;
  redeemBefore: Date;
  issuedAt: Date;
  status: TeamOsLicenseStatus;
  note: string | null;
  redeemedAt: Date | null;
  redeemedByUserId: string | null;
  companyId: string | null;
  teamId: string | null;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  alreadyRedeemed: boolean;
}

export interface ConsumeTeamOsLicenseInput {
  code: string;
  userId: string;
  companyId: string;
  teamId: string;
  request?: Request;
  now?: Date;
}
