import {
  preprocessGptOSInput,
  type GptOSPreprocessedInput,
  type GptOSRawAttachmentInput
} from "@/lib/enterprise/gpt-os-input-preprocessor";
import {
  buildGptOSUnifiedReasoningCore,
  type GptOSUnifiedReasoningContext
} from "@/lib/enterprise/gpt-os-unified-reasoning-core";
import type { GptOSTaskPlan } from "@/lib/enterprise/gpt-os-planner";
import type { GptOSPersonaMemory } from "@/lib/enterprise/gpt-os-persona-memory";

export type GptOSModality = "text" | "voice" | "file" | "image" | "multi";

export interface GptOSModalityFlags {
  text: boolean;
  voice: boolean;
  image: boolean;
  file: boolean;
  structured: boolean;
}

export interface GptOSUnifiedContext {
  modality: GptOSModality;
  flags: GptOSModalityFlags;
  content: string;
  metadata: {
    fileCount: number;
    imageCount: number;
    voiceDetected: boolean;
    structuredDetected: boolean;
    textLength: number;
  };
  memorySignals: string[];
  agentHints: string[];
  fileUsed: boolean;
  imageUsed: boolean;
  voiceUsed: boolean;
  fileSummaries: string[];
  imageContexts: string[];
  voiceTranscript?: string;
  unifiedReasoning: GptOSUnifiedReasoningContext;
}

interface MultimodalInput {
  text: string;
  voiceTranscript?: string | null;
  attachments?: GptOSRawAttachmentInput[];
  recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
}

function resolveModality(flags: GptOSModalityFlags): GptOSModality {
  const activeCount = [flags.text, flags.voice, flags.image, flags.file].filter(Boolean).length;

  if (activeCount > 1) {
    return "multi";
  }

  if (flags.voice) return "voice";
  if (flags.image) return "image";
  if (flags.file) return "file";

  return "text";
}

function detectAgentHints(preprocessed: GptOSPreprocessedInput) {
  const source = [
    preprocessed.textContent,
    preprocessed.voiceTranscript,
    ...preprocessed.fileContexts.map((file) => file.textPreview),
    ...preprocessed.imageContexts.map((image) => image.caption)
  ].join("\n");
  const hints = new Set<string>();

  if (/分析|原因|优化|排查|诊断/.test(source)) hints.add("analysis-agent");
  if (/销售|话术|转化|招商|客户异议/.test(source)) hints.add("sales-agent");
  if (/讲解|教我|学习|教程/.test(source)) hints.add("teaching-agent");
  if (/系统|产品|流程|架构|方案/.test(source)) hints.add("pm-agent");
  if (/合规|风险|权限|审核|医疗|法律|财务/.test(source)) hints.add("compliance-agent");
  if (preprocessed.metadata.fileCount > 0) hints.add("file-reasoning");
  if (preprocessed.metadata.imageCount > 0) hints.add("image-metadata-reasoning");
  if (preprocessed.metadata.voiceDetected) hints.add("voice-transcript-reasoning");

  return Array.from(hints);
}

function buildUnifiedContent(preprocessed: GptOSPreprocessedInput) {
  return [
    preprocessed.textContent ? `Text:\n${preprocessed.textContent}` : "",
    preprocessed.voiceTranscript ? `Voice transcript:\n${preprocessed.voiceTranscript}` : "",
    preprocessed.fileContexts.length
      ? `Files:\n${preprocessed.fileContexts.map((file) => `- ${file.fileName}: ${file.textPreview}`).join("\n")}`
      : "",
    preprocessed.imageContexts.length
      ? `Images:\n${preprocessed.imageContexts.map((image) => `- ${image.fileName}: ${image.caption}`).join("\n")}`
      : ""
  ].filter(Boolean).join("\n\n");
}

export function detectGptOSInputType(input: MultimodalInput): GptOSModalityFlags {
  const preprocessed = preprocessGptOSInput(input);

  return {
    text: preprocessed.textContent.length > 0,
    voice: preprocessed.metadata.voiceDetected,
    image: preprocessed.metadata.imageCount > 0,
    file: preprocessed.metadata.fileCount > 0,
    structured: preprocessed.metadata.structuredDetected
  };
}

export function buildGptOSUnifiedContext(input: MultimodalInput, fusion?: {
  planner?: GptOSTaskPlan;
  memory?: GptOSPersonaMemory;
}): GptOSUnifiedContext {
  const preprocessed = preprocessGptOSInput(input);
  const flags = {
    text: preprocessed.textContent.length > 0,
    voice: preprocessed.metadata.voiceDetected,
    image: preprocessed.metadata.imageCount > 0,
    file: preprocessed.metadata.fileCount > 0,
    structured: preprocessed.metadata.structuredDetected
  };
  const modality = resolveModality(flags);
  const fileSummaries = preprocessed.fileContexts.map((file) => `${file.fileName}: ${file.textPreview}`);
  const imageContexts = preprocessed.imageContexts.map((image) => `${image.fileName}: ${image.caption}`);
  const memorySignals = [
    modality !== "text" ? `modality:${modality}` : "modality:text",
    flags.file ? "memory:file-interaction" : "",
    flags.image ? "memory:image-metadata" : "",
    flags.voice ? "memory:voice-transcript" : "",
    flags.structured ? "memory:structured-input" : ""
  ].filter(Boolean);
  const agentHints = detectAgentHints(preprocessed);
  const unifiedReasoning = buildGptOSUnifiedReasoningCore({
    text: preprocessed.textContent,
    voiceTranscript: preprocessed.voiceTranscript || undefined,
    fileSummaries,
    imageContexts,
    modality,
    flags,
    metadata: preprocessed.metadata,
    agentHints,
    planner: fusion?.planner,
    memory: fusion?.memory
  });

  return {
    modality,
    flags,
    content: buildUnifiedContent(preprocessed),
    metadata: preprocessed.metadata,
    memorySignals,
    agentHints,
    fileUsed: flags.file,
    imageUsed: flags.image,
    voiceUsed: flags.voice,
    fileSummaries,
    imageContexts,
    voiceTranscript: preprocessed.voiceTranscript || undefined,
    unifiedReasoning
  };
}
