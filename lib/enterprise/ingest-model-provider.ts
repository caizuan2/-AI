import "server-only";

import {
  runOpenAIAdminIngest,
  type OpenAIAdminIngestInput,
  type OpenAIAdminIngestResult
} from "@/lib/enterprise/openai-ingest-client";
import {
  runDeepSeekAdminIngest,
  type DeepSeekAdminIngestInput,
  type DeepSeekAdminIngestResult
} from "@/lib/enterprise/deepseek-ingest-client";
import {
  getIngestModelOption,
  type IngestModelProvider
} from "@/lib/enterprise/ingest-model-options";
import { buildGptOSErrorUX } from "@/lib/enterprise/gpt-os-error-ux-layer";

export type AdminIngestModelInput = (OpenAIAdminIngestInput | DeepSeekAdminIngestInput) & {
  modelProvider?: IngestModelProvider | string | null;
};

export type AdminIngestModelResult = OpenAIAdminIngestResult | DeepSeekAdminIngestResult;

export function resolveAdminIngestModelProvider(input: {
  modelProvider?: string | null;
  selectedModelLabel?: string | null;
  modelDisplayName?: string | null;
  preferredModel?: string | null;
}) {
  return getIngestModelOption({
    provider: input.modelProvider,
    selectedModelLabel: input.selectedModelLabel,
    modelDisplayName: input.modelDisplayName,
    preferredModel: input.preferredModel
  });
}

export async function runAdminIngestWithSelectedModel(input: AdminIngestModelInput): Promise<AdminIngestModelResult> {
  const option = resolveAdminIngestModelProvider(input);

  if (option.provider === "deepseek") {
    try {
      return await runDeepSeekAdminIngest({
        ...input,
        selectedModelLabel: input.selectedModelLabel || option.label,
        modelDisplayName: input.modelDisplayName || option.displayName,
        preferredModel: input.preferredModel || option.defaultModel
      } as DeepSeekAdminIngestInput);
    } catch (error) {
      const ux = buildGptOSErrorUX(error, {
        primaryProvider: "deepseek",
        fallbackModel: "safe-fallback"
      });

      throw new Error([
        ux.userMessage,
        ...ux.diagnostics
      ].join(" | "));
    }
  }

  try {
    return await runOpenAIAdminIngest({
      ...input,
      selectedModelLabel: input.selectedModelLabel || option.label,
      modelDisplayName: input.modelDisplayName || option.displayName,
      preferredModel: input.preferredModel || option.defaultModel
    } as OpenAIAdminIngestInput);
  } catch (error) {
    const ux = buildGptOSErrorUX(error, {
      primaryProvider: "openai",
      fallbackModel: "deepseek"
    });

    if (!ux.shouldAttemptModelFallback) {
      throw new Error([
        ux.userMessage,
        ...ux.diagnostics
      ].join(" | "));
    }

    const fallbackOption = getIngestModelOption({
      provider: "deepseek"
    });

    try {
      const fallbackResult = await runDeepSeekAdminIngest({
        ...input,
        selectedModelLabel: fallbackOption.label,
        modelDisplayName: fallbackOption.displayName,
        preferredModel: fallbackOption.defaultModel,
        requestId: input.requestId ? `${input.requestId}-fallback-deepseek` : undefined
      } as DeepSeekAdminIngestInput);

      return {
        ...fallbackResult,
        diagnostics: [
          ...fallbackResult.diagnostics,
          "errorHandled:true",
          "fallbackUsed:true",
          "fallbackModel:deepseek",
          "userFacingError:false",
          "systemRecovered:true",
          ...ux.diagnostics
        ]
      };
    } catch (fallbackError) {
      const fallbackUx = buildGptOSErrorUX(fallbackError, {
        primaryProvider: "deepseek",
        fallbackModel: "safe-fallback"
      });

      throw new Error([
        fallbackUx.userMessage,
        "fallbackUsed:true",
        "fallbackModel:safe-fallback",
        "systemRecovered:false",
        ...ux.diagnostics,
        ...fallbackUx.diagnostics
      ].join(" | "));
    }
  }
}
