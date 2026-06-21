import type { GptCallProof } from "@/lib/enterprise/gpt-call-proof";

export interface GptOSModelTruth {
  actualModel: string;
  expectedModel: string;
  match: boolean;
  provider: "openai" | "deepseek" | "qwen" | "unknown";
  responseId?: string;
  proofId?: string;
  fallbackUsed: boolean;
  fallbackSource: "openai" | "deepseek" | "qwen" | "none" | "unknown";
  requestTested: boolean;
  qualityPassed: boolean;
  modelVerified: boolean;
}

export interface GptOSModelTruthInput {
  expectedModel?: string | null;
  actualModel?: string | null;
  provider?: string | null;
  responseId?: string | null;
  proofId?: string | null;
  fallbackUsed?: boolean | null;
  fallbackSource?: string | null;
  gptProof?: GptCallProof | null;
}

function normalizeProvider(value?: string | null): GptOSModelTruth["provider"] {
  const normalized = (value ?? "").toLowerCase();

  if (normalized.includes("openai")) return "openai";
  if (normalized.includes("deepseek")) return "deepseek";
  if (normalized.includes("qwen")) return "qwen";

  return "unknown";
}

function normalizeFallbackSource(value?: string | null): GptOSModelTruth["fallbackSource"] {
  const provider = normalizeProvider(value);

  if (provider === "unknown") return "unknown";

  return provider;
}

export function validateGptOSModelTruth(input: GptOSModelTruthInput): GptOSModelTruth {
  const proof = input.gptProof ?? null;
  const actualModel = input.actualModel || proof?.actualModel || "";
  const expectedModel = input.expectedModel || proof?.requestedModel || "gpt-5.5";
  const provider = normalizeProvider(input.provider || proof?.provider);
  const fallbackUsed = Boolean(input.fallbackUsed ?? proof?.fallback ?? false);
  const responseId = input.responseId || proof?.responseId || "";
  const proofId = input.proofId || proof?.proofId || responseId || "";
  const actual = actualModel.toLowerCase();
  const expected = expectedModel.toLowerCase();
  const match = Boolean(actual && expected && (actual.includes(expected) || expected.includes(actual)));

  return {
    actualModel,
    expectedModel,
    match,
    provider,
    responseId: responseId || undefined,
    proofId: proofId || undefined,
    fallbackUsed,
    fallbackSource: fallbackUsed ? normalizeFallbackSource(input.fallbackSource || provider) : "none",
    requestTested: Boolean(proof?.requestTested || responseId),
    qualityPassed: Boolean(proof?.qualityPassed),
    modelVerified: Boolean(match && responseId && !fallbackUsed)
  };
}
