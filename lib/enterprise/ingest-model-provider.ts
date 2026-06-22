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
    return runDeepSeekAdminIngest({
      ...input,
      selectedModelLabel: input.selectedModelLabel || option.label,
      modelDisplayName: input.modelDisplayName || option.displayName,
      preferredModel: input.preferredModel || option.defaultModel
    } as DeepSeekAdminIngestInput);
  }

  return runOpenAIAdminIngest({
    ...input,
    selectedModelLabel: input.selectedModelLabel || option.label,
    modelDisplayName: input.modelDisplayName || option.displayName,
    preferredModel: input.preferredModel || option.defaultModel
  } as OpenAIAdminIngestInput);
}
