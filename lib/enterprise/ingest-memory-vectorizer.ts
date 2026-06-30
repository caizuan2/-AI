import type { IngestMemoryItem } from "@/lib/enterprise/ingest-memory-types";

type KeywordVector = Map<string, number>;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "you",
  "are",
  "我",
  "你",
  "他",
  "她",
  "它",
  "我们",
  "你们",
  "他们",
  "一个",
  "这个",
  "那个",
  "以及",
  "然后",
  "但是",
  "所以",
  "因为",
  "如果",
  "可以",
  "需要",
  "进行",
  "就是",
  "不是"
]);

function normalizeText(input: unknown) {
  return typeof input === "string"
    ? input.toLowerCase().replace(/\s+/g, " ").trim()
    : "";
}

function addToken(vector: KeywordVector, token: string, weight: number) {
  const clean = token.trim();

  if (!clean || clean.length < 2 || STOP_WORDS.has(clean)) {
    return;
  }

  vector.set(clean, (vector.get(clean) ?? 0) + weight);
}

export function tokenizeMemoryText(text: string) {
  const normalized = normalizeText(text);
  const tokens: string[] = [];
  const latinWords = normalized.match(/[a-z0-9_]{2,}/g) ?? [];
  const chineseText = normalized.replace(/[^\u4e00-\u9fa5]/g, "");

  tokens.push(...latinWords);

  for (let index = 0; index < chineseText.length - 1; index += 1) {
    tokens.push(chineseText.slice(index, index + 2));
  }

  const keywordMatches = normalized.match(/[\u4e00-\u9fa5a-z0-9_]{2,12}/g) ?? [];
  tokens.push(...keywordMatches);

  return tokens.filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

export function buildKeywordVector(text: string, weight = 1) {
  const vector: KeywordVector = new Map();

  for (const token of tokenizeMemoryText(text)) {
    addToken(vector, token, weight);
  }

  return vector;
}

function mergeInto(target: KeywordVector, source: KeywordVector) {
  for (const [token, score] of Array.from(source.entries())) {
    target.set(token, (target.get(token) ?? 0) + score);
  }

  return target;
}

export function buildMemorySearchText(memory: IngestMemoryItem) {
  return [
    memory.title,
    memory.type,
    memory.category,
    memory.summary,
    ...(memory.tags ?? []),
    memory.content
  ].filter(Boolean).join("\n");
}

export function buildMemoryWeightedVector(memory: IngestMemoryItem) {
  const vector: KeywordVector = new Map();

  mergeInto(vector, buildKeywordVector(memory.title, 3));
  mergeInto(vector, buildKeywordVector((memory.tags ?? []).join(" "), 2));
  mergeInto(vector, buildKeywordVector(memory.summary ?? "", 2));
  mergeInto(vector, buildKeywordVector(memory.content, 1));
  mergeInto(vector, buildKeywordVector(memory.type, 1.5));
  mergeInto(vector, buildKeywordVector(memory.category ?? "", 1.4));

  return vector;
}

export function cosineLikeSimilarity(left: KeywordVector, right: KeywordVector) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (const value of Array.from(left.values())) {
    leftNorm += value * value;
  }

  for (const value of Array.from(right.values())) {
    rightNorm += value * value;
  }

  for (const [token, value] of Array.from(left.entries())) {
    dot += value * (right.get(token) ?? 0);
  }

  if (!leftNorm || !rightNorm) {
    return 0;
  }

  return Math.max(0, Math.min(1, dot / Math.sqrt(leftNorm * rightNorm)));
}

export function jaccardSimilarity(left: KeywordVector, right: KeywordVector) {
  const tokens = new Set([...Array.from(left.keys()), ...Array.from(right.keys())]);
  let intersection = 0;
  let union = 0;

  for (const token of Array.from(tokens)) {
    const leftHas = left.has(token);
    const rightHas = right.has(token);

    if (leftHas || rightHas) {
      union += 1;
    }

    if (leftHas && rightHas) {
      intersection += 1;
    }
  }

  return union ? intersection / union : 0;
}

export function scoreTextSimilarity(query: string, memory: IngestMemoryItem) {
  const queryVector = buildKeywordVector(query, 1);
  const memoryVector = buildMemoryWeightedVector(memory);
  const cosine = cosineLikeSimilarity(queryVector, memoryVector);
  const jaccard = jaccardSimilarity(queryVector, memoryVector);

  return Math.max(0, Math.min(1, cosine * 0.72 + jaccard * 0.28));
}

export function findMatchedMemoryFields(query: string, memory: IngestMemoryItem) {
  const queryTokens = new Set(tokenizeMemoryText(query));
  const fields: Array<[string, string]> = [
    ["title", memory.title],
    ["tags", (memory.tags ?? []).join(" ")],
    ["summary", memory.summary ?? ""],
    ["content", memory.content],
    ["type", memory.type],
    ["category", memory.category ?? ""]
  ];

  return fields
    .filter(([, value]) => tokenizeMemoryText(value).some((token) => queryTokens.has(token)))
    .map(([field]) => field);
}
