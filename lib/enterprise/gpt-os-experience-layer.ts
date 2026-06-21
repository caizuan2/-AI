export type GptOSExperienceMode = "simple" | "pro" | "dev";

export interface GptOSExperienceConfig {
  mode: GptOSExperienceMode;
  label: "SIMPLE" | "PRO" | "DEV";
  title: string;
  description: string;
  showTechnicalDetails: boolean;
  showCostAndModel: boolean;
  showDeveloperPanel: boolean;
}

export const GPT_OS_EXPERIENCE_MODES: GptOSExperienceConfig[] = [
  {
    mode: "simple",
    label: "SIMPLE",
    title: "干净回答",
    description: "默认只保留 ChatGPT 风格回答，OS 信息全部隐藏。",
    showTechnicalDetails: false,
    showCostAndModel: false,
    showDeveloperPanel: false
  },
  {
    mode: "pro",
    label: "PRO",
    title: "专业信息",
    description: "按需查看模型、fallback、token 和成本，不进入主聊天流。",
    showTechnicalDetails: true,
    showCostAndModel: true,
    showDeveloperPanel: false
  },
  {
    mode: "dev",
    label: "DEV",
    title: "开发调试",
    description: "隔离展示 workflow、tool trace、reasoning trace 和 loop 状态。",
    showTechnicalDetails: true,
    showCostAndModel: true,
    showDeveloperPanel: true
  }
];

export function getGptOSExperienceConfig(mode: GptOSExperienceMode) {
  return GPT_OS_EXPERIENCE_MODES.find((item) => item.mode === mode) ?? GPT_OS_EXPERIENCE_MODES[0];
}

export function getGptOSExperienceModeLabel(mode: GptOSExperienceMode) {
  return getGptOSExperienceConfig(mode).label;
}

export function resolveGptOSExperienceMode(input: {
  autoMode: boolean;
  detectedMode?: GptOSExperienceMode | null;
  manualMode: GptOSExperienceMode;
}) {
  return input.autoMode ? input.detectedMode ?? "simple" : input.manualMode;
}
