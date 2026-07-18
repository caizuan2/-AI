import type { KnowledgeFeedbackType } from "@/apps/team-os/features/ai-brain/types";
import { normalizeQuestionKey, stableBrainKey } from "@/apps/team-os/features/ai-brain/utils/content-safety";

export interface QuestionMiningInput {
  id: string;
  teamId: string | null;
  question: string;
  feedbackType: KnowledgeFeedbackType;
}

export interface MinedQuestionSuggestion {
  teamId?: string;
  knowledgeId: string;
  suggestionKey: string;
  suggestion: string;
  occurrences: number;
}

export interface CustomerQuestionMiningInput {
  id: string;
  teamId: string;
  content: string;
  summary: string;
}

export function mineFrequentKnowledgeGaps(
  companyId: string,
  feedback: QuestionMiningInput[],
  minimumOccurrences = 2
) {
  const groups = new Map<string, QuestionMiningInput[]>();
  for (const item of feedback) {
    if (item.feedbackType !== "BAD" && item.feedbackType !== "MISSING") continue;
    const normalized = normalizeQuestionKey(item.question);
    if (!normalized) continue;
    const key = `${item.teamId ?? "company"}:${normalized}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return Array.from(groups.entries()).flatMap(([key, items]) => {
    if (items.length < minimumOccurrences) return [];
    const first = items[0]!;
    const typeLabel = items.some((item) => item.feedbackType === "MISSING") ? "缺失" : "低质量";
    return [{
      ...(first.teamId ? { teamId: first.teamId } : {}),
      knowledgeId: `feedback:${stableBrainKey(companyId, key).slice(0, 24)}`,
      suggestionKey: stableBrainKey("feedback-gap", companyId, key),
      suggestion: `高频知识${typeLabel}（${items.length} 次）：“${first.question}”。建议补充标准答案、适用边界和可执行示例。`,
      occurrences: items.length
    } satisfies MinedQuestionSuggestion];
  });
}

function questionSentences(value: string) {
  return value
    .split(/[\n。！!]+/)
    .map((part) => part.trim().replace(/^(?:客户|用户)?(?:询问|问)\s*[:：]?\s*/, ""))
    .filter((part) => /[?？]$/.test(part) && part.length >= 4 && part.length <= 200);
}

export function mineFrequentCustomerQuestions(
  companyId: string,
  followUps: CustomerQuestionMiningInput[],
  minimumOccurrences = 3
) {
  const groups = new Map<string, Array<{ teamId: string; question: string }>>();
  for (const followUp of followUps) {
    const uniqueInFollowUp = new Map<string, string>();
    for (const question of [
      ...questionSentences(followUp.content),
      ...questionSentences(followUp.summary)
    ]) {
      const normalized = normalizeQuestionKey(question);
      if (normalized && !uniqueInFollowUp.has(normalized)) uniqueInFollowUp.set(normalized, question);
    }
    for (const [normalized, question] of Array.from(uniqueInFollowUp.entries())) {
      const key = `${followUp.teamId}:${normalized}`;
      groups.set(key, [...(groups.get(key) ?? []), { teamId: followUp.teamId, question }]);
    }
  }
  return Array.from(groups.entries()).flatMap(([key, items]) => {
    if (items.length < minimumOccurrences) return [];
    const first = items[0]!;
    return [{
      teamId: first.teamId,
      knowledgeId: `crm-question:${stableBrainKey(companyId, key).slice(0, 24)}`,
      suggestionKey: stableBrainKey("customer-question", companyId, key),
      suggestion: `客户高频问题（${items.length} 次）：“${first.question}”。建议新增 FAQ，包含标准答案、适用条件与升级人工处理边界。`,
      occurrences: items.length
    } satisfies MinedQuestionSuggestion];
  });
}

export class QuestionMiningService {
  mine = mineFrequentKnowledgeGaps;
  mineCustomerQuestions = mineFrequentCustomerQuestions;
}

export const questionMiningService = new QuestionMiningService();
