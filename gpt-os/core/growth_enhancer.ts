export interface GrowthEnhancerState {
  enabled: false;
  status: "disabled";
  reason: "default_off";
}

export function createGrowthEnhancerState(): GrowthEnhancerState {
  return {
    enabled: false,
    status: "disabled",
    reason: "default_off",
  };
}
