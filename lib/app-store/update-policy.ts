import type { AppStoreVersion } from "./version-catalog";

export interface UpdatePolicyInput {
  currentBuild: number;
  release: Pick<AppStoreVersion, "build" | "minimum_build" | "force_update">;
}

export interface UpdatePolicyResult {
  hasUpdate: boolean;
  forceUpdate: boolean;
  reason: "none" | "newer_build" | "minimum_build" | "force_update";
}

export function evaluateUpdatePolicy(input: UpdatePolicyInput): UpdatePolicyResult {
  const hasUpdate = input.release.build > input.currentBuild;

  if (!hasUpdate) {
    return {
      hasUpdate: false,
      forceUpdate: false,
      reason: "none"
    };
  }

  if (input.currentBuild < input.release.minimum_build) {
    return {
      hasUpdate: true,
      forceUpdate: true,
      reason: "minimum_build"
    };
  }

  if (input.release.force_update) {
    return {
      hasUpdate: true,
      forceUpdate: true,
      reason: "force_update"
    };
  }

  return {
    hasUpdate: true,
    forceUpdate: false,
    reason: "newer_build"
  };
}
