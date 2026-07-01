import type {
  RuntimeV4CustomerPathOptimization,
  RuntimeV4OptimizedRecommendation,
} from "./runtime-v4-growth-types";

function hasRiskyPromise(text: string) {
  return /保证|必瘦|一定瘦|治愈|疗效|包好|百分百/.test(text);
}

export function assertRuntimeV4GrowthSafe(input: {
  enabled: boolean;
  scopeKey: string;
  totalEvents: number;
  optimizedRecommendation: RuntimeV4OptimizedRecommendation;
  customerPathOptimization: RuntimeV4CustomerPathOptimization;
}) {
  const warnings: string[] = [];
  const joined = [
    input.optimizedRecommendation.recommendedAction,
    input.optimizedRecommendation.reason,
    input.customerPathOptimization.nextOptimization,
  ].join(" ");

  if (!input.enabled || !input.scopeKey) {
    warnings.push("缺少知识库/Agent 隔离范围，v4 仅展示基础策略，不写入学习。");
  }

  if (input.totalEvents < 3) {
    warnings.push("样本不足，当前仅作为建议，不自动替换正式话术。");
  }

  if (hasRiskyPromise(joined)) {
    warnings.push("检测到强承诺风险，成交话术需要保留边界，不做效果保证。");
  }

  warnings.push("v4 只做推荐和展示，不自动发送消息，不强迫成交。");

  return warnings;
}
