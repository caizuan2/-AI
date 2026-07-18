export const enabledGptProviders = ["openai"] as const;

export type GptProvider = typeof enabledGptProviders[number];
export type GptFamily = "gpt";
export type GptTier = "smart" | "fast" | "balanced" | "advanced" | "ultra" | "pro";
export type GptVersion = "5.5" | "5.4" | "5.3" | "4.5" | "o3";

export interface GptTierOption {
  tier: GptTier;
  label: string;
}

export interface GptVersionOption {
  version: GptVersion;
  apiModel: string;
}

export interface GptModelSelection {
  provider: GptProvider;
  family: GptFamily;
  version: GptVersion;
  tier: GptTier;
  tierLabel: string;
  displayName: string;
  apiModel: string;
  modelMode: "highest";
}

export const GPT_MODEL_TIERS: GptTierOption[] = [
  { tier: "smart", label: "智能" },
  { tier: "fast", label: "极速" },
  { tier: "balanced", label: "均衡" },
  { tier: "advanced", label: "高级" },
  { tier: "ultra", label: "超高" },
  { tier: "pro", label: "专业" }
];

export const GPT_MODEL_VERSIONS: GptVersionOption[] = [
  { version: "5.5", apiModel: "gpt-5.5" },
  { version: "5.4", apiModel: "gpt-5.4" },
  { version: "5.3", apiModel: "gpt-5.3" },
  { version: "4.5", apiModel: "gpt-4.5" },
  { version: "o3", apiModel: "o3" }
];

const DEFAULT_TIER: GptTier = "ultra";
const DEFAULT_VERSION: GptVersion = "5.5";

function readTierOption(tier: string | null | undefined) {
  return GPT_MODEL_TIERS.find((option) => option.tier === tier) ?? GPT_MODEL_TIERS.find((option) => option.tier === DEFAULT_TIER) ?? GPT_MODEL_TIERS[0];
}

function readVersionOption(version: string | null | undefined) {
  return GPT_MODEL_VERSIONS.find((option) => option.version === version) ?? GPT_MODEL_VERSIONS.find((option) => option.version === DEFAULT_VERSION) ?? GPT_MODEL_VERSIONS[0];
}

export function createGptModelSelection(input: {
  version?: GptVersion | string | null;
  tier?: GptTier | string | null;
} = {}): GptModelSelection {
  const tier = readTierOption(input.tier);
  const version = readVersionOption(input.version);

  return {
    provider: "openai",
    family: "gpt",
    version: version.version,
    tier: tier.tier,
    tierLabel: tier.label,
    displayName: `GPT-${version.version} ${tier.label}`,
    apiModel: version.apiModel,
    modelMode: "highest"
  };
}

export const DEFAULT_GPT_MODEL_SELECTION = createGptModelSelection({
  version: DEFAULT_VERSION,
  tier: DEFAULT_TIER
});

export const GPT_MODEL_OPTIONS = GPT_MODEL_VERSIONS.flatMap((version) =>
  GPT_MODEL_TIERS.map((tier) => createGptModelSelection({
    version: version.version,
    tier: tier.tier
  }))
);

export const GPT_MODEL_DISPLAY_NAMES = GPT_MODEL_OPTIONS.map((option) => option.displayName);

export function getGptModelSelectionByDisplayName(label: string | null | undefined) {
  const value = (label ?? "").trim();
  const matched = GPT_MODEL_OPTIONS.find((option) => option.displayName === value);

  if (matched) {
    return matched;
  }

  const version = GPT_MODEL_VERSIONS.find((option) => value.includes(`GPT-${option.version}`) || value.includes(option.apiModel))?.version;
  const tier = GPT_MODEL_TIERS.find((option) => value.includes(option.label) || value.toLowerCase().includes(option.tier))?.tier;

  return createGptModelSelection({ version, tier });
}

export function isGptModelDisplayName(label: string | null | undefined) {
  const value = (label ?? "").trim();

  return /^GPT-(5\.5|5\.4|5\.3|4\.5|o3)\s+/.test(value) || /gpt|openai/i.test(value);
}
