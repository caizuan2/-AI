export {
  consumeTeamOsLicenseGrantInTransaction,
  findTeamOsLicenseGrantByCode,
  hashTeamOsLicenseCode,
  verifyTeamOsLicenseGrantInTransaction
} from "@/apps/team-os/features/licensing/services/team-os-license-repository";

export type {
  ConsumeTeamOsLicenseInput,
  TeamOsLicenseGrant,
  TeamOsLicenseStatus
} from "@/apps/team-os/features/licensing/types";
