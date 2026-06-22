import type { GptOSTaskIntent, GptOSTaskPlan } from "@/lib/enterprise/gpt-os-planner";
import type { GptOSPersonaMemory } from "@/lib/enterprise/gpt-os-persona-memory";

export type GptOSUnifiedReasoningModality = "text" | "voice" | "file" | "image" | "multi";

export interface GptOSUnifiedReasoningFlags {
  text: boolean;
  voice: boolean;
  image: boolean;
  file: boolean;
  structured: boolean;
}

export interface GptOSUnifiedReasoningContext {
  intent: GptOSTaskIntent | "unknown";
  memory?: {
    personaLabel: string;
    style: string;
    domain: string;
    cognitivePattern: string;
    preferences: string[];
  };
  multimodal: {
    text: string;
    voice?: string;
    file?: string;
    image?: string;
  };
  agentHints: string[];
  systemSignals: {
    modality: GptOSUnifiedReasoningModality;
    flags: GptOSUnifiedReasoningFlags;
    textLength: number;
    fileCount: number;
    imageCount: number;
    voiceDetected: boolean;
    structuredDetected: boolean;
    cognitiveLoad: "low" | "medium" | "high";
    fusionStrategy: "single-context";
  };
  cognitiveFrame: {
    summary: string;
    dominantContext: "text" | "voice" | "file" | "image" | "mixed";
    reasoningGoal: string;
    riskNotes: string[];
  };
  singleReasoningInput: string;
}

interface UnifiedReasoningInput {
  text: string;
  voiceTranscript?: string;
  fileSummaries?: string[];
  imageContexts?: string[];
  modality: GptOSUnifiedReasoningModality;
  flags: GptOSUnifiedReasoningFlags;
  metadata: {
    textLength: number;
    fileCount: number;
    imageCount: number;
    voiceDetected: boolean;
    structuredDetected: boolean;
  };
  agentHints: string[];
  planner?: GptOSTaskPlan;
  memory?: GptOSPersonaMemory;
}

function limit(value: string, maxLength: number) {
  const text = value.trim();

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function detectDominantContext(input: UnifiedReasoningInput): GptOSUnifiedReasoningContext["cognitiveFrame"]["dominantContext"] {
  const active = [
    input.flags.text,
    input.flags.voice,
    input.flags.file,
    input.flags.image
  ].filter(Boolean).length;

  if (active > 1) return "mixed";
  if (input.flags.file) return "file";
  if (input.flags.image) return "image";
  if (input.flags.voice) return "voice";
  return "text";
}

function resolveCognitiveLoad(input: UnifiedReasoningInput) {
  if (input.planner?.complexity === "high" || input.metadata.fileCount > 1 || input.metadata.textLength > 500) {
    return "high" as const;
  }

  if (input.planner?.complexity === "medium" || input.metadata.fileCount === 1 || input.metadata.imageCount > 0 || input.metadata.voiceDetected) {
    return "medium" as const;
  }

  return "low" as const;
}

function buildReasoningGoal(intent: GptOSTaskIntent | "unknown") {
  if (intent === "debugging") return "定位问题、解释原因、给出可验证修复路径";
  if (intent === "creation") return "把输入合成为可交付方案、草稿或流程";
  if (intent === "learning") return "把输入讲清楚，并提炼可复用知识";
  if (intent === "analysis") return "综合上下文给出判断、依据和下一步";

  return "统一理解上下文并生成自然回答";
}

function buildRiskNotes(input: UnifiedReasoningInput) {
  const notes: string[] = [];

  if (input.flags.image) {
    notes.push("图片只使用元数据和上下文说明，不虚构未解析的视觉细节");
  }

  if (input.flags.file && input.fileSummaries?.some((item) => /当前未获得可解析正文|元数据/.test(item))) {
    notes.push("部分文件正文不足，需要明确说明推理限制");
  }

  if (input.flags.voice) {
    notes.push("语音转写可能有口语噪声，需要按上下文理解后再结构化");
  }

  return notes;
}

function buildSingleReasoningInput(input: UnifiedReasoningInput, riskNotes: string[]) {
  return [
    `Intent: ${input.planner?.intent ?? "unknown"}`,
    `Reasoning goal: ${buildReasoningGoal(input.planner?.intent ?? "unknown")}`,
    input.memory ? `Persona: ${input.memory.personaLabel} / ${input.memory.style} / ${input.memory.domain}` : "",
    "",
    "Unified cognitive context:",
    input.text ? `Text:\n${limit(input.text, 1600)}` : "",
    input.voiceTranscript ? `Voice transcript:\n${limit(input.voiceTranscript, 900)}` : "",
    input.fileSummaries?.length ? `File context:\n${input.fileSummaries.map((item) => `- ${limit(item, 900)}`).join("\n")}` : "",
    input.imageContexts?.length ? `Image context:\n${input.imageContexts.map((item) => `- ${limit(item, 600)}`).join("\n")}` : "",
    riskNotes.length ? `Risk notes:\n${riskNotes.map((note) => `- ${note}`).join("\n")}` : ""
  ].filter(Boolean).join("\n");
}

export function buildGptOSUnifiedReasoningCore(input: UnifiedReasoningInput): GptOSUnifiedReasoningContext {
  const intent = input.planner?.intent ?? "unknown";
  const dominantContext = detectDominantContext(input);
  const cognitiveLoad = resolveCognitiveLoad(input);
  const riskNotes = buildRiskNotes(input);
  const text = limit(input.text, 1800);
  const voice = input.voiceTranscript ? limit(input.voiceTranscript, 900) : undefined;
  const file = input.fileSummaries?.length ? input.fileSummaries.map((item) => limit(item, 1000)).join("\n") : undefined;
  const image = input.imageContexts?.length ? input.imageContexts.map((item) => limit(item, 700)).join("\n") : undefined;

  return {
    intent,
    memory: input.memory
      ? {
        personaLabel: input.memory.personaLabel,
        style: input.memory.style,
        domain: input.memory.domain,
        cognitivePattern: input.memory.cognitiveModel.dominantPattern,
        preferences: input.memory.preferences
      }
      : undefined,
    multimodal: {
      text,
      voice,
      file,
      image
    },
    agentHints: input.agentHints,
    systemSignals: {
      modality: input.modality,
      flags: input.flags,
      textLength: input.metadata.textLength,
      fileCount: input.metadata.fileCount,
      imageCount: input.metadata.imageCount,
      voiceDetected: input.metadata.voiceDetected,
      structuredDetected: input.metadata.structuredDetected,
      cognitiveLoad,
      fusionStrategy: "single-context"
    },
    cognitiveFrame: {
      summary: `Unified ${input.modality} context · ${cognitiveLoad} cognitive load`,
      dominantContext,
      reasoningGoal: buildReasoningGoal(intent),
      riskNotes
    },
    singleReasoningInput: buildSingleReasoningInput(input, riskNotes)
  };
}
