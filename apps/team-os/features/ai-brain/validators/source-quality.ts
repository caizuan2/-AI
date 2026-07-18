import { ValidationError } from "@/lib/errors";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1_000;

export function assertRecentSource(createdAt: Date, now = new Date()) {
  if (createdAt.getTime() < now.getTime() - NINETY_DAYS_MS) {
    throw new ValidationError("仅支持提取最近 90 天的业务记录。");
  }
}

export function assertExcellentScore(input: {
  score: number;
  industryScore?: number | null;
  skillScores?: number[];
}) {
  if (input.score < 85) {
    throw new ValidationError("该记录尚未达到 85 分的优秀案例提取标准。");
  }
  if (input.industryScore !== null && input.industryScore !== undefined && input.industryScore < 80) {
    throw new ValidationError("该记录的行业标准得分低于 80 分，暂不进入候选知识。");
  }
  if (input.skillScores?.some((score) => score < 14)) {
    throw new ValidationError("该记录存在低于 14 分的关键能力项，暂不作为优秀案例。");
  }
}

export function assertWorkflowQuality(input: {
  decisionTriggered: boolean;
  productionRuns: number;
  successfulRuns: number;
}) {
  if (!input.decisionTriggered) {
    throw new ValidationError("未触发业务动作的工作流记录不能沉淀为最佳实践。");
  }
  if (input.productionRuns < 3) {
    throw new ValidationError("该工作流近 30 天生产执行不足 3 次，样本量尚不够稳定。");
  }
  if (input.successfulRuns / input.productionRuns < 0.8) {
    throw new ValidationError("该工作流近 30 天成功率低于 80%，暂不沉淀为最佳实践。");
  }
}
