import type { GptOSExperienceMode } from "@/lib/enterprise/gpt-os-experience-layer";

export interface GptOSAutoUXDecision {
  mode: GptOSExperienceMode;
  confidence: number;
  matchedSignals: string[];
  reason: string;
}

const devSignals = [
  "debug",
  "error",
  "bug",
  "codex",
  "api",
  "runtime",
  "stack",
  "trace",
  "报错",
  "错误",
  "调试",
  "接口",
  "控制台",
  "日志",
  "白屏",
  "解析失败"
];

const proSignals = [
  "explain",
  "analysis",
  "compare",
  "why",
  "system design",
  "architecture",
  "方案",
  "分析",
  "解释",
  "为什么",
  "对比",
  "设计",
  "架构",
  "复盘",
  "拆解",
  "原因",
  "优化"
];

const simpleSignals = [
  "hi",
  "hello",
  "你好",
  "在吗",
  "谢谢",
  "好的"
];

function matchSignals(text: string, signals: string[]) {
  const normalized = text.toLowerCase();

  return signals.filter((signal) => normalized.includes(signal.toLowerCase()));
}

export function detectGptOSAutoUXMode(input: string): GptOSAutoUXDecision {
  const text = input.trim();
  const devMatches = matchSignals(text, devSignals);

  if (devMatches.length > 0) {
    return {
      mode: "dev",
      confidence: Math.min(0.96, 0.72 + devMatches.length * 0.06),
      matchedSignals: devMatches,
      reason: `检测到系统/调试意图：${devMatches.join("、")}`
    };
  }

  const proMatches = matchSignals(text, proSignals);

  if (proMatches.length > 0 || text.length > 80) {
    return {
      mode: "pro",
      confidence: Math.min(0.92, 0.64 + Math.max(1, proMatches.length) * 0.06),
      matchedSignals: proMatches.length ? proMatches : ["long-form"],
      reason: proMatches.length
        ? `检测到分析/解释意图：${proMatches.join("、")}`
        : "输入较长，自动切换到专业解释模式"
    };
  }

  const simpleMatches = matchSignals(text, simpleSignals);

  return {
    mode: "simple",
    confidence: simpleMatches.length ? 0.86 : 0.68,
    matchedSignals: simpleMatches.length ? simpleMatches : ["general-chat"],
    reason: simpleMatches.length
      ? `检测到轻量对话：${simpleMatches.join("、")}`
      : "默认使用干净回答模式"
  };
}
