export type RepairRootCause = "knowledge" | "retrieval" | "prompt" | "model";

export interface RepairStrategyInput {
  relevanceScore: number;
  hitCount: number;
  answerGroundingScore: number;
  fallbackUsed: boolean;
  providerStatus?: string;
}

export interface RepairStrategy {
  root_cause: RepairRootCause;
  fix_strategy: string;
}

export function decideRepairStrategy(input: RepairStrategyInput): RepairStrategy {
  if (input.hitCount === 0) {
    return {
      root_cause: "knowledge",
      fix_strategy: "生成知识补丁并交给投喂端人工审核，补充缺失知识。",
    };
  }

  if (input.relevanceScore < 0.3) {
    return {
      root_cause: "retrieval",
      fix_strategy: "生成 RAG 切片优化建议，人工复查关键词、标题、摘要和上下文。",
    };
  }

  if (input.answerGroundingScore < 0.35) {
    return {
      root_cause: "prompt",
      fix_strategy: "生成 prompt 约束建议，强化基于知识库回答和结构化输出。",
    };
  }

  if (input.fallbackUsed || input.providerStatus === "error") {
    return {
      root_cause: "model",
      fix_strategy: "检查模型供应商状态和 fallback 透明化记录，不自动切换模型。",
    };
  }

  return {
    root_cause: "retrieval",
    fix_strategy: "当前无高风险修复项，仅保留诊断结果供人工复查。",
  };
}
