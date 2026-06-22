export interface GptOSContentScoringInput {
  text: string;
  contentType?: string;
  structureSignals?: string[];
  optimizationGoals?: string[];
}

export interface GptOSContentScore {
  readability: number;
  structure: number;
  businessValue: number;
  virality: number;
  totalScore: number;
  scoreLabel: "low" | "medium" | "high";
  formattingInfluence: "metadata_only";
  primaryOutputInfluence: "none";
  uiInfluence: "none";
  signals: string[];
  improvementSuggestions: string[];
}

function clampScore(value: number) {
  return Math.max(0, Math.min(10, Math.round(value)));
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function scoreLabel(totalScore: number): GptOSContentScore["scoreLabel"] {
  if (totalScore >= 8) return "high";
  if (totalScore >= 5.8) return "medium";

  return "low";
}

export function scoreGptOSBusinessContent(input: GptOSContentScoringInput): GptOSContentScore {
  const text = input.text.trim();
  const source = [
    text,
    input.contentType ?? "",
    ...(input.structureSignals ?? []),
    ...(input.optimizationGoals ?? [])
  ].join(" ");
  const signals = new Set<string>();
  const suggestions = new Set<string>();
  const hasStructure = hasAny(source, [/SOP|流程|步骤|清单|模板|结构|章节|报告|大纲/i]);
  const hasConversion = hasAny(source, [/转化|成交|销售|客户|话术|招商|报价|变现|付费|商业/i]);
  const hasKnowledge = hasAny(source, [/知识库|标准问答|FAQ|培训|课程|入库|案例|行业/i]);
  const hasDistribution = hasAny(source, [/SEO|搜索|文章|公域|传播|标题|关键词|小红书|公众号|短视频/i]);

  if (hasStructure) signals.add("structure-ready");
  if (hasConversion) signals.add("conversion-aware");
  if (hasKnowledge) signals.add("knowledge-reusable");
  if (hasDistribution) signals.add("distribution-aware");

  const readability = clampScore(5 + (text.length > 40 ? 1 : 0) + (text.length > 120 ? 1 : 0) + (/[。！？\n]/.test(text) ? 1 : 0));
  const structure = clampScore(4 + (hasStructure ? 3 : 0) + (input.structureSignals?.length ?? 0) * 0.8);
  const businessValue = clampScore(4 + (hasConversion ? 3 : 0) + (hasKnowledge ? 1 : 0) + (source.includes("高价值") ? 1 : 0));
  const virality = clampScore(3 + (hasDistribution ? 3 : 0) + (hasConversion ? 1 : 0) + (/痛点|案例|结果|对比/i.test(source) ? 1 : 0));
  const totalScore = Number(((readability + structure + businessValue + virality) / 4).toFixed(1));

  if (structure < 7) {
    suggestions.add("在后台结构化草稿中补充标题、分段、步骤和检查点；主回复仍保持自然解释优先。");
  }

  if (businessValue < 7) {
    suggestions.add("在内容建议中补充目标客户、使用场景、转化动作和价值主张，不改变主回复语气。");
  }

  if (virality < 6) {
    suggestions.add("可在后续运营草稿里补充传播标题、关键词、案例或前后对比。");
  }

  if (!hasKnowledge) {
    suggestions.add("在 structured metadata 中补充标准问答和知识库标签，方便后续检索。");
  }

  return {
    readability,
    structure,
    businessValue,
    virality,
    totalScore,
    scoreLabel: scoreLabel(totalScore),
    formattingInfluence: "metadata_only",
    primaryOutputInfluence: "none",
    uiInfluence: "none",
    signals: Array.from(signals),
    improvementSuggestions: Array.from(suggestions).slice(0, 4)
  };
}
