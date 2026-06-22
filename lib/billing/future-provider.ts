import { resolvePlan, type BillingProvider } from "@/lib/billing/billing.provider";
import type { BillingProviderType } from "@/types/billing";

export function createFutureBillingProvider(type: Exclude<BillingProviderType, "license">): BillingProvider {
  return {
    type,
    async validate() {
      return {
        active: false,
        provider: type,
        plan: "free",
        reason: "provider_not_configured"
      };
    },
    async getPlan() {
      return resolvePlan("free");
    },
    async checkLimit() {
      return {
        allowed: false,
        reason: "provider_not_configured"
      };
    },
    async charge() {
      throw new Error(`${type} billing provider is reserved for a future payment integration stage.`);
    }
  };
}
