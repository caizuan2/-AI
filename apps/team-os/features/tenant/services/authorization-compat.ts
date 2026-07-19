import "server-only";

import type { TeamOsFeatureKey } from "@/apps/team-os/features/tenant/types";

export type TenantAuthorizationProviderMode = "OPAQUE_SINGLE_USE_GRANT";

export interface TenantAuthorizationCapabilities {
  mode: TenantAuthorizationProviderMode;
  available: boolean;
  companyBound: true;
  planBound: true;
  expires: true;
  revocable: true;
  singleUse: true;
}

export interface TenantAuthorizationVerifyInput {
  code: string;
  companyId: string;
  targetPlanId: string;
  actorUserId: string;
}

export interface TenantAuthorizationGrant {
  grantId: string;
  companyId: string;
  planId: string;
  featureKeys: TeamOsFeatureKey[];
  expiresAt: string;
}

export type TenantAuthorizationVerifyResult =
  | {
      valid: true;
      grant: TenantAuthorizationGrant;
    }
  | {
      valid: false;
      reason: "PROVIDER_UNAVAILABLE" | "INVALID" | "EXPIRED" | "REVOKED" | "ALREADY_USED" | "SCOPE_MISMATCH";
    };

export interface TenantAuthorizationProvider {
  readonly mode: TenantAuthorizationProviderMode;
  getCapabilities(): TenantAuthorizationCapabilities;
  verify(input: TenantAuthorizationVerifyInput): Promise<TenantAuthorizationVerifyResult>;
}

const capabilities: TenantAuthorizationCapabilities = Object.freeze({
  mode: "OPAQUE_SINGLE_USE_GRANT",
  available: false,
  companyBound: true,
  planBound: true,
  expires: true,
  revocable: true,
  singleUse: true
});

/**
 * Phase 6 deliberately ships a disabled compatibility provider. A future
 * implementation must consume a server-issued, database-backed, one-time
 * grant that is bound to both company and plan. Existing user, ingest and
 * super-admin license codes are intentionally outside this contract.
 */
export const tenantAuthorizationProvider: TenantAuthorizationProvider = Object.freeze({
  mode: "OPAQUE_SINGLE_USE_GRANT" as const,
  getCapabilities() {
    return capabilities;
  },
  async verify(input: TenantAuthorizationVerifyInput): Promise<TenantAuthorizationVerifyResult> {
    void input;
    return { valid: false, reason: "PROVIDER_UNAVAILABLE" };
  }
});

export function getTenantAuthorizationCapabilities() {
  return tenantAuthorizationProvider.getCapabilities();
}
