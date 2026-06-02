import type { KnowledgeSaveStrategy } from "@prisma/client";
import type { StructuredKnowledge } from "@/lib/ai/knowledge-structurer";
import { normalizeQualityScores, type KnowledgeQualityScores } from "@/lib/knowledge/quality";
import { getSaveStrategyRecommendation } from "@/lib/settings";

export interface AnalyzeDraft extends KnowledgeQualityScores {
  shouldSave: boolean;
  title: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  reason: string;
}

export interface AnalyzeResponse extends AnalyzeDraft {
  saveStrategy: KnowledgeSaveStrategy;
  saveRecommendation: string;
}

export function mockAnalyzeKnowledge(content: string): AnalyzeDraft {
  const normalized = content.trim();
  const hasConcreteInfo = normalized.length >= 20;
  const mentionsCustomer = /客户|用户|销售|客服|交付|试点|上线/.test(normalized);
  const mentionsSourceNeed = /引用|来源|复盘|权限|风险|故障|安全|文档|文件/.test(normalized);
  const shouldSave = hasConcreteInfo && (mentionsCustomer || mentionsSourceNeed || normalized.length >= 80);
  const category = mentionsCustomer ? "客户成功" : mentionsSourceNeed ? "产品资料" : "未分类";
  const importance = shouldSave ? (mentionsSourceNeed ? 4 : 3) : 1;
  const qualityScores = normalizeQualityScores({
    clarityScore: normalized.length >= 40 ? 4 : 2,
    completenessScore: /因为|如果|需要|建议|规则|流程|结论|步骤|来源/.test(normalized) ? 4 : 2,
    usefulnessScore: shouldSave ? 4 : 2,
    confidenceScore: /来源|会议|客户|用户|数据|文档|复盘|文件/.test(normalized) ? 4 : 3
  });
  const tags = [
    "投喂",
    mentionsCustomer ? "客户" : null,
    mentionsSourceNeed ? "待引用" : null
  ].filter((tag): tag is string => Boolean(tag));

  return {
    shouldSave,
    title: shouldSave ? `${category}知识整理` : "暂不建议入库的零散内容",
    summary: `${normalized.slice(0, 140)}${normalized.length > 140 ? "..." : ""}`,
    tags,
    category,
    importance,
    ...qualityScores,
    reason: shouldSave
      ? "内容包含可复用的业务背景或决策信息，适合整理后进入知识库。"
      : "内容较短或缺少明确业务上下文，建议补充来源、场景和结论后再入库。"
  };
}

export function toAnalyzeDraft(knowledge: StructuredKnowledge): AnalyzeDraft {
  return {
    shouldSave: knowledge.shouldSave,
    title: knowledge.title,
    summary: knowledge.summary,
    tags: knowledge.tags,
    category: knowledge.category,
    importance: knowledge.importance,
    clarityScore: knowledge.clarityScore,
    completenessScore: knowledge.completenessScore,
    usefulnessScore: knowledge.usefulnessScore,
    confidenceScore: knowledge.confidenceScore,
    reason: knowledge.reason
  };
}

export function withSaveStrategy(draft: AnalyzeDraft, saveStrategy: KnowledgeSaveStrategy): AnalyzeResponse {
  return {
    ...draft,
    reason: `${draft.reason} ${getSaveStrategyRecommendation(saveStrategy, draft.shouldSave)}`,
    saveStrategy,
    saveRecommendation: getSaveStrategyRecommendation(saveStrategy, draft.shouldSave)
  };
}
