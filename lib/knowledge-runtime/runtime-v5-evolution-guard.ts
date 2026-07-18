import type { RuntimeV5StrategyCandidate } from "./runtime-v5-strategy-types";

const HIGH_RISK_PATTERN = /保证|必瘦|必成|立刻见效|不买就|焦虑|后悔|最后机会|百分百|100%/i;

export function assertRuntimeV5EvolutionSafe(input: {
  scopeKey: string;
  strategyCandidates: RuntimeV5StrategyCandidate[];
  sampleCount?: number;
  warnings?: string[];
}) {
  const warnings = new Set(input.warnings ?? []);
  warnings.add("v5 只推荐策略，不自动发送消息。");
  warnings.add("策略学习按 knowledgeBaseId/kbId + agentId/expertId 隔离。");
  warnings.add("不保存手机号、姓名等客户敏感身份信息。");

  if ((input.sampleCount ?? 0) < 3) {
    warnings.add("样本不足 3 条时，仅标记 keep_testing，不做强淘汰结论。");
  }

  const strategyCandidates = input.strategyCandidates.map((candidate) => {
    const text = `${candidate.label} ${candidate.messagePattern} ${candidate.expectedOutcome}`;
    if (candidate.complianceRisk === "high" || HIGH_RISK_PATTERN.test(text)) {
      return {
        ...candidate,
        status: "retired" as const,
        reason: "命中高风险承诺/焦虑表达，已由 guard 退休，不再推荐。",
      };
    }

    if (candidate.complianceRisk === "medium" && (input.sampleCount ?? 0) < 3) {
      return {
        ...candidate,
        status: candidate.status === "promoted" ? "testing" as const : candidate.status,
        reason: candidate.reason ?? "中风险策略需要更多样本验证，保持测试状态。",
      };
    }

    return candidate;
  });

  return {
    scopeKey: input.scopeKey,
    strategyCandidates,
    warnings: Array.from(warnings),
  };
}
