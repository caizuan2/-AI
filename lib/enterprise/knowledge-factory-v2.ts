export type KnowledgeUnitType = "concept" | "SOP" | "FAQ" | "scenario";

export interface KnowledgeUnit {
  id: string;
  type: KnowledgeUnitType;
  title: string;
  content: string;
  tags: string[];
  embedding_ready: true;
}

export interface KnowledgeFactoryDocument {
  text: string;
  title?: string;
  category?: string;
  tags?: string[];
  sourceType?: "chat" | "text" | "file" | "image" | "url";
}

export interface KnowledgeFactoryV2Result {
  version: "knowledge-factory-v2";
  summary: string;
  units: KnowledgeUnit[];
  sop: KnowledgeUnit[];
  faq: KnowledgeUnit[];
  scenarios: KnowledgeUnit[];
  tags: string[];
  indexHints: string[];
  retrievalHints: string[];
  generationPlan: string[];
  storage: {
    mode: "draft_metadata_only";
    indexReady: boolean;
    unitCount: number;
  };
}

export interface KnowledgeFactoryDraftLike {
  title: string;
  summary?: string;
  category: string;
  tags: string[];
  standardQuestion: string;
  standardAnswer: string;
  standardQuestions?: string[];
  standardAnswers?: string[];
  qaPairs?: Array<{ q: string; a: string }>;
  scenarios?: string[];
  sourceMaterials?: string[];
  suggestedQuestions?: string[];
  missingFields?: string[];
  knowledgeFactory?: KnowledgeFactoryV2Result;
}

const MAX_UNIT_CONTENT = 420;

function cleanText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\u200b/g, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compact(value: string, maxLength = MAX_UNIT_CONTENT) {
  const normalized = cleanText(value).replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).replace(/[，,。；;\s]+$/, "")}...`;
}

function uniqueStrings(values: Array<string | undefined | null>, limit = 12) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result.slice(0, limit);
}

function splitSentences(text: string) {
  return cleanText(text)
    .replace(/\n+/g, "。")
    .split(/(?<=[。！？!?；;])\s*/)
    .map((item) => item.trim().replace(/[。！？!?；;]+$/, ""))
    .filter((item) => item.length >= 8);
}

function splitBlocks(text: string) {
  const blocks = cleanText(text)
    .split(/\n{2,}|(?=^#{1,4}\s+)/m)
    .map((item) => cleanText(item).replace(/^#{1,4}\s+/, ""))
    .filter((item) => item.length >= 12);

  if (blocks.length > 0) {
    return blocks;
  }

  return splitSentences(text);
}

function inferTitle(text: string, fallback = "知识单元") {
  const firstLine = cleanText(text).split("\n").find(Boolean) ?? "";
  const stripped = firstLine
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[.)、]\s+/, "")
    .replace(/^#{1,4}\s+/, "")
    .trim();

  if (!stripped) {
    return fallback;
  }

  return stripped.length > 28 ? `${stripped.slice(0, 28)}...` : stripped;
}

function inferTags(text: string, category?: string, seedTags: string[] = []) {
  const tags = new Set<string>();
  const source = `${text} ${category ?? ""}`;

  for (const tag of seedTags) {
    if (tag.trim()) {
      tags.add(tag.trim());
    }
  }

  if (/退款|退货|换货|售后|保修|发货|工单/.test(source)) {
    tags.add("售后");
  }

  if (/客户|客服|话术|异议|回复|咨询/.test(source)) {
    tags.add("客服话术");
  }

  if (/产品|功能|套餐|版本|权益|价格|报价/.test(source)) {
    tags.add("产品知识");
  }

  if (/流程|SOP|步骤|审批|规范|制度|执行/.test(source)) {
    tags.add("SOP");
  }

  if (/风险|合规|禁用|过期|承诺|法律|医疗|财务/.test(source)) {
    tags.add("合规边界");
  }

  if (category?.trim()) {
    tags.add(category.replace("知识库", "").trim());
  }

  return uniqueStrings(Array.from(tags), 10);
}

function makeUnit(input: {
  type: KnowledgeUnitType;
  title: string;
  content: string;
  tags: string[];
  index: number;
}): KnowledgeUnit {
  return {
    id: `${input.type.toLowerCase()}-${input.index + 1}`,
    type: input.type,
    title: input.title,
    content: compact(input.content),
    tags: uniqueStrings(input.tags, 8),
    embedding_ready: true
  };
}

function makeQuestionFromTitle(title: string) {
  const clean = title.replace(/[？?。！!]+$/, "");

  return `关于“${clean}”，一线人员应该如何处理？`;
}

function mergeQaPairs(
  current: Array<{ q: string; a: string }> | undefined,
  units: KnowledgeUnit[]
) {
  const existing = current ?? [];
  const generated = units.map((unit) => ({
    q: unit.type === "FAQ" && /[？?]/.test(unit.title) ? unit.title : makeQuestionFromTitle(unit.title),
    a: unit.content
  }));
  const seen = new Set<string>();
  const result: Array<{ q: string; a: string }> = [];

  for (const pair of [...existing, ...generated]) {
    const q = pair.q.trim();
    const a = pair.a.trim();

    if (!q || !a || seen.has(q)) {
      continue;
    }

    seen.add(q);
    result.push({ q, a });
  }

  return result.slice(0, 10);
}

export class KnowledgeFactoryV2 {
  ingest(document: KnowledgeFactoryDocument): KnowledgeFactoryV2Result {
    const text = cleanText(document.text);
    const baseTags = inferTags(text, document.category, document.tags ?? []);
    const conceptUnits = this.extractKnowledgeUnits(text, document);
    const sop = this.buildSOP(text, document);
    const faq = this.buildFAQ(text, document);
    const scenarios = this.buildScenarios(text, document);
    const units = this.tagKnowledge([...conceptUnits, ...sop, ...faq, ...scenarios], baseTags);

    return {
      version: "knowledge-factory-v2",
      summary: this.summarize(text, document.title),
      units,
      sop,
      faq,
      scenarios,
      tags: uniqueStrings(units.flatMap((unit) => unit.tags).concat(baseTags), 12),
      indexHints: this.buildIndexHints(units),
      retrievalHints: this.buildRetrievalHints(units),
      generationPlan: this.buildGenerationPlan(units),
      storage: this.storeStructuredKnowledge(units)
    };
  }

  extractKnowledgeUnits(text: string, document: KnowledgeFactoryDocument = { text }): KnowledgeUnit[] {
    const tags = inferTags(text, document.category, document.tags ?? []);
    const blocks = splitBlocks(text).slice(0, 5);

    return blocks.map((block, index) => makeUnit({
      type: "concept",
      title: inferTitle(block, document.title ?? "核心知识点"),
      content: block,
      tags,
      index
    }));
  }

  buildSOP(text: string, document: KnowledgeFactoryDocument = { text }): KnowledgeUnit[] {
    const sentences = splitSentences(text);
    const actionSentences = sentences.filter((sentence) => /先|再|然后|最后|需要|必须|应当|建议|步骤|流程|执行|确认|核对|判断/.test(sentence));
    const selected = (actionSentences.length > 0 ? actionSentences : sentences).slice(0, 4);

    if (selected.length === 0) {
      return [];
    }

    const content = selected.map((sentence, index) => `${index + 1}. ${sentence}`).join("\n");

    return [makeUnit({
      type: "SOP",
      title: `${document.title ?? inferTitle(text, "执行流程")} SOP`,
      content,
      tags: inferTags(text, document.category, [...(document.tags ?? []), "SOP"]),
      index: 0
    })];
  }

  buildFAQ(text: string, document: KnowledgeFactoryDocument = { text }): KnowledgeUnit[] {
    const sentences = splitSentences(text);
    const explicitQuestions = sentences.filter((sentence) => /[？?]|如何|怎么|为什么|是否|能不能/.test(sentence));
    const source = explicitQuestions.length > 0 ? explicitQuestions : sentences.slice(0, 3);
    const tags = inferTags(text, document.category, [...(document.tags ?? []), "FAQ"]);

    return source.slice(0, 4).map((sentence, index) => {
      const title = /[？?]$/.test(sentence) ? sentence : makeQuestionFromTitle(inferTitle(sentence, document.title ?? "知识点"));

      return makeUnit({
        type: "FAQ",
        title,
        content: sentence,
        tags,
        index
      });
    });
  }

  buildScenarios(text: string, document: KnowledgeFactoryDocument = { text }): KnowledgeUnit[] {
    const sentences = splitSentences(text);
    const scenarioSentences = sentences.filter((sentence) => /当|如果|客户|用户|适合|适用|场景|一线|销售|客服|售后|培训/.test(sentence));
    const source = scenarioSentences.length > 0 ? scenarioSentences : sentences.slice(0, 2);
    const tags = inferTags(text, document.category, [...(document.tags ?? []), "场景"]);

    return source.slice(0, 4).map((sentence, index) => makeUnit({
      type: "scenario",
      title: `场景 ${index + 1}：${inferTitle(sentence, document.title ?? "适用场景")}`,
      content: sentence,
      tags,
      index
    }));
  }

  tagKnowledge(units: KnowledgeUnit[], baseTags: string[] = []) {
    return units.map((unit) => ({
      ...unit,
      tags: uniqueStrings([...unit.tags, ...baseTags, unit.type], 10)
    }));
  }

  storeStructuredKnowledge(units: KnowledgeUnit[]): KnowledgeFactoryV2Result["storage"] {
    return {
      mode: "draft_metadata_only",
      indexReady: units.length > 0 && units.every((unit) => unit.embedding_ready),
      unitCount: units.length
    };
  }

  private summarize(text: string, title?: string) {
    const source = splitSentences(text)[0] ?? cleanText(text);

    return compact(title ? `${title}：${source}` : source, 180);
  }

  private buildIndexHints(units: KnowledgeUnit[]) {
    return units
      .slice(0, 8)
      .map((unit) => `${unit.type}:${unit.title}`)
      .filter(Boolean);
  }

  private buildRetrievalHints(units: KnowledgeUnit[]) {
    const questions = units
      .filter((unit) => unit.type === "FAQ" || unit.type === "scenario")
      .map((unit) => unit.type === "FAQ" ? unit.title : makeQuestionFromTitle(unit.title));

    return uniqueStrings(questions, 8);
  }

  private buildGenerationPlan(units: KnowledgeUnit[]) {
    const hasSop = units.some((unit) => unit.type === "SOP");
    const hasFaq = units.some((unit) => unit.type === "FAQ");
    const hasScenario = units.some((unit) => unit.type === "scenario");

    return [
      "先检索最相关 Knowledge Unit",
      hasSop ? "命中 SOP 时优先按步骤回答" : null,
      hasFaq ? "命中 FAQ 时直接复用标准问答口径" : null,
      hasScenario ? "命中场景时补充适用边界和一线话术" : null,
      "最后由当前模型组合生成自然回答"
    ].filter((item): item is string => Boolean(item));
  }
}

export function enrichDraftWithKnowledgeFactory<T extends KnowledgeFactoryDraftLike>(
  draft: T,
  input: KnowledgeFactoryDocument
): T {
  const factory = new KnowledgeFactoryV2();
  const text = cleanText([
    input.text,
    draft.summary,
    draft.standardQuestion,
    draft.standardAnswer
  ].filter(Boolean).join("\n\n"));
  const result = factory.ingest({
    ...input,
    text,
    title: input.title ?? draft.title,
    category: input.category ?? draft.category,
    tags: uniqueStrings([...(input.tags ?? []), ...draft.tags], 12)
  });
  const qaPairs = mergeQaPairs(draft.qaPairs, result.faq);
  const standardQuestions = uniqueStrings([
    ...(draft.standardQuestions ?? []),
    ...qaPairs.map((pair) => pair.q),
    ...result.retrievalHints
  ], 10);
  const standardAnswers = uniqueStrings([
    ...(draft.standardAnswers ?? []),
    ...qaPairs.map((pair) => pair.a)
  ], 10);
  const scenarios = uniqueStrings([
    ...(draft.scenarios ?? []),
    ...result.scenarios.map((unit) => `${unit.title}：${unit.content}`)
  ], 8);
  const sourceMaterials = uniqueStrings([
    ...(draft.sourceMaterials ?? []),
    ...result.indexHints.map((hint) => `KnowledgeFactory:${hint}`)
  ], 10);
  const suggestedQuestions = uniqueStrings([
    ...(draft.suggestedQuestions ?? []),
    ...result.retrievalHints
  ], 8);

  return {
    ...draft,
    tags: uniqueStrings([...draft.tags, ...result.tags], 12),
    qaPairs,
    standardQuestions,
    standardAnswers,
    standardQuestion: draft.standardQuestion || standardQuestions[0] || makeQuestionFromTitle(draft.title),
    standardAnswer: draft.standardAnswer || standardAnswers[0] || draft.summary || result.summary,
    scenarios,
    sourceMaterials,
    suggestedQuestions,
    knowledgeFactory: result
  };
}
