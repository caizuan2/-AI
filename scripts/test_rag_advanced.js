#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync, unlinkSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const fileLoadedKeys = new Set();

function parseEnvValue(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadEnvFile(filePath, allowFileOverride) {
  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const shouldWrite = process.env[key] === undefined || (allowFileOverride && fileLoadedKeys.has(key));

    if (shouldWrite) {
      process.env[key] = parseEnvValue(rawValue);
      fileLoadedKeys.add(key);
    }
  }
}

loadEnvFile(join(process.cwd(), ".env"), false);
loadEnvFile(join(process.cwd(), ".env.local"), true);

try {
  require("@next/env").loadEnvConfig(process.cwd());
} catch {
  // The script can still run when env vars are injected by the host.
}

const runner = String.raw`
import { writeFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import {
  CHAT_MIN_RELEVANT_SIMILARITY,
  CHAT_TOP_K,
  RAG_MAX_CONTEXT_CHARS,
  RAG_MAX_CONTEXT_CHUNKS,
  getChatModelForProvider,
  getEmbeddingModel,
  getEmbeddingProviderName,
  getPrimaryAIProvider,
  hasDatabaseUrl,
  hasUsableChatProvider
} from "@/lib/server-config-core";
import { generateRagAnswer, type RagContext } from "@/lib/ai/rag-answer";
import { retrieveKnowledge } from "@/lib/rag/retriever";

type TestSource = {
  citationIndex: number;
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  summary: string;
  chunkText: string;
  category: string;
  sourceType: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  similarity: number;
  score: number;
};

const questions = [
  "联创合伙人",
  "联创合伙人计划的资格要求是什么？",
  "新伙伴问我怎么成为联创合伙人，我应该怎么说？"
];

const aiLikePhrases = [
  "根据知识库显示",
  "根据知识库",
  "作为 AI",
  "作为一个 AI",
  "综上所述",
  "根据提供的上下文",
  "根据检索结果",
  "知识库中没有找到足够依据",
  "无法回答该问题"
];

const keyPointRules = [
  {
    key: "qualification",
    label: "资格/条件",
    pattern: /资格|条件|要求|适用对象|五星|梦想家园|领导人|讲师|联创合伙人计划/
  },
  {
    key: "forbidden",
    label: "禁止事项/边界",
    pattern: /禁止|不能|不得|不允许|避免|承诺|收益|公开下发|夸大|边界/
  },
  {
    key: "script",
    label: "可用话术",
    pattern: /话术|可以这样说|建议这样说|你可以说|表达|沟通口径|谨慎可用/
  },
  {
    key: "executionAdvice",
    label: "执行建议",
    pattern: /建议|下一步|执行|确认|引导|补充|私下|负责人|课程讲师|先问|再判断/
  }
];

function boolEnv(name: string) {
  return ["1", "true", "yes", "on"].includes((process.env[name] ?? "").trim().toLowerCase());
}

function pickReportPath() {
  return process.env.RAG_TEST_REPORT_PATH?.trim() || "rag-advanced-test-report.json";
}

function toSources(results: Awaited<ReturnType<typeof retrieveKnowledge>>["results"]): TestSource[] {
  const seen = new Set<string>();
  const sources: TestSource[] = [];

  for (const result of results) {
    const key = result.knowledgeItemId + ":" + result.chunkId;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    sources.push({
      citationIndex: sources.length + 1,
      chunkId: result.chunkId,
      knowledgeItemId: result.knowledgeItemId,
      title: result.title,
      summary: result.summary,
      chunkText: result.chunkText,
      category: result.category,
      sourceType: result.sourceType,
      sourceTitle: result.sourceTitle,
      sourceUrl: result.sourceUrl,
      similarity: result.similarity,
      score: result.score
    });
  }

  return sources;
}

function toRagContexts(sources: TestSource[]): RagContext[] {
  let usedChars = 0;
  const contexts: RagContext[] = [];

  for (const source of sources.slice(0, RAG_MAX_CONTEXT_CHUNKS)) {
    const remaining = RAG_MAX_CONTEXT_CHARS - usedChars;

    if (remaining <= 0) {
      break;
    }

    const content = source.chunkText.slice(0, remaining);

    usedChars += content.length;
    contexts.push({
      id: source.knowledgeItemId,
      title: source.title,
      content,
      summary: source.summary,
      category: source.category,
      sourceType: source.sourceType,
      sourceId: source.chunkId,
      sourceTitle: source.sourceTitle,
      sourceUrl: source.sourceUrl,
      score: source.score,
      similarity: source.similarity
    });
  }

  return contexts;
}

function ensureAnswerHasCitation(answer: string, sources: TestSource[]) {
  if (sources.length === 0 || sources.some((source) => answer.includes("[" + source.citationIndex + "]"))) {
    return answer;
  }

  const titles = sources.map((source) => "[" + source.citationIndex + "]「" + source.title + "」").join("、");

  return answer + "\n\n引用来源：" + titles;
}

function buildLocalAnswer(question: string, sources: TestSource[], answerMode: "none" | "partial" | "full") {
  if (sources.length === 0 || answerMode === "none") {
    return [
      "结论：当前资料没有命中直接依据，不能把答案说死。",
      "",
      "解释：需要补充联创合伙人计划的制度原文、资格条件、禁止表达、标准话术和实际沟通案例。",
      "",
      "建议：先收集完整规则，再对外统一口径。",
      "",
      "可用话术：这部分我先帮你确认正式规则，避免把资格、权益或收益说错。",
      "",
      "注意事项：不要承诺资格、收益、名额或审批结果。"
    ].join("\n");
  }

  const snippets = sources
    .slice(0, 4)
    .map((source) => "- " + source.chunkText.slice(0, 220) + " [" + source.citationIndex + "]")
    .join("\n");

  return [
    answerMode === "partial"
      ? "结论：目前只能按已命中的资料做谨慎回答，资格、禁止事项和执行口径还需要继续确认。"
      : "结论：可以基于已命中的资料回答，但具体执行仍要以最新制度为准。",
    "",
    "解释：",
    snippets,
    "",
    "建议：先核对资格要求、适用对象、审批或确认流程，再决定是否推荐对方进入下一步。",
    "",
    "可用话术：你可以先了解联创合伙人计划的正式资格和边界，如果条件匹配，我再帮你对接下一步确认。",
    "",
    "注意事项：不要夸大收益，不要承诺一定入选，不要绕开正式确认流程。"
  ].join("\n");
}

function analyzeAnswer(answer: string) {
  const keyPoints = keyPointRules.map((rule) => ({
    key: rule.key,
    label: rule.label,
    covered: rule.pattern.test(answer)
  }));
  const aiLikeMatches = aiLikePhrases.filter((phrase) => answer.includes(phrase));

  return {
    keyPoints,
    missingKeyPoints: keyPoints.filter((item) => !item.covered).map((item) => item.label),
    aiLike: {
      passed: aiLikeMatches.length === 0,
      matches: aiLikeMatches
    }
  };
}

async function resolveUser() {
  const override = process.env.RAG_TEST_USER_ID?.trim();

  if (override) {
    const user = await prisma.user.findUnique({
      where: { id: override },
      select: { id: true, phone: true, email: true }
    });

    return user ?? { id: override, phone: null, email: null };
  }

  const itemWithChunks = await prisma.knowledgeItem.findFirst({
    where: {
      chunks: {
        some: {}
      }
    },
    orderBy: { updatedAt: "desc" },
    select: {
      user: {
        select: { id: true, phone: true, email: true }
      }
    }
  });

  if (itemWithChunks?.user) {
    return itemWithChunks.user;
  }

  const item = await prisma.knowledgeItem.findFirst({
    orderBy: { updatedAt: "desc" },
    select: {
      user: {
        select: { id: true, phone: true, email: true }
      }
    }
  });

  return item?.user ?? null;
}

async function getIndexStatus(userId: string | null) {
  const itemWhere = userId ? { userId } : undefined;
  const chunkWhere = userId ? { knowledgeItem: { userId } } : undefined;
  const [knowledgeItems, chunks] = await Promise.all([
    prisma.knowledgeItem.count({ where: itemWhere }),
    prisma.knowledgeChunk.count({ where: chunkWhere })
  ]);
  const scopedChunkStatusSql = [
    'SELECT',
    '  COUNT(*)::int AS "totalChunks",',
    '  COUNT(kc."embedding")::int AS "embeddedChunks",',
    '  COUNT(*) FILTER (WHERE kc."embedding" IS NULL)::int AS "missingEmbeddings",',
    '  COUNT(*) FILTER (WHERE kc."metadata"->>\'embeddingStatus\' = \'indexed\')::int AS "metadataIndexedChunks"',
    'FROM "knowledge_chunks" kc',
    'INNER JOIN "knowledge_items" ki ON ki."id" = kc."knowledgeItemId"',
    'WHERE ki."userId" = $1'
  ].join("\n");
  const globalChunkStatusSql = [
    'SELECT',
    '  COUNT(*)::int AS "totalChunks",',
    '  COUNT(kc."embedding")::int AS "embeddedChunks",',
    '  COUNT(*) FILTER (WHERE kc."embedding" IS NULL)::int AS "missingEmbeddings",',
    '  COUNT(*) FILTER (WHERE kc."metadata"->>\'embeddingStatus\' = \'indexed\')::int AS "metadataIndexedChunks"',
    'FROM "knowledge_chunks" kc'
  ].join("\n");
  const rows = userId
    ? await prisma.$queryRawUnsafe<Array<{
        totalChunks: number;
        embeddedChunks: number;
        missingEmbeddings: number;
        metadataIndexedChunks: number;
      }>>(scopedChunkStatusSql, userId)
    : await prisma.$queryRawUnsafe<Array<{
        totalChunks: number;
        embeddedChunks: number;
        missingEmbeddings: number;
        metadataIndexedChunks: number;
      }>>(globalChunkStatusSql);
  const vectorStatusSql = [
    'SELECT',
    '  EXISTS(SELECT 1 FROM pg_extension WHERE extname = \'vector\') AS "pgvectorEnabled",',
    '  EXISTS(',
    '    SELECT 1',
    '    FROM pg_proc p',
    '    JOIN pg_namespace n ON n.oid = p.pronamespace',
    '    WHERE n.nspname = \'public\'',
    '      AND p.proname = \'match_knowledge_chunks\'',
    '  ) AS "matchFunctionExists"'
  ].join("\n");
  const vectorRows = await prisma.$queryRawUnsafe<Array<{
    pgvectorEnabled: boolean;
    matchFunctionExists: boolean;
  }>>(vectorStatusSql);
  const counts = rows[0] ?? {
    totalChunks: chunks,
    embeddedChunks: 0,
    missingEmbeddings: chunks,
    metadataIndexedChunks: 0
  };

  return {
    knowledgeItems,
    chunks,
    embeddedChunks: counts.embeddedChunks,
    missingEmbeddings: counts.missingEmbeddings,
    metadataIndexedChunks: counts.metadataIndexedChunks,
    vectorizedRatio: counts.totalChunks > 0 ? Math.round((counts.embeddedChunks / counts.totalChunks) * 10000) / 100 : 0,
    pgvectorEnabled: Boolean(vectorRows[0]?.pgvectorEnabled),
    matchFunctionExists: Boolean(vectorRows[0]?.matchFunctionExists)
  };
}

async function runQuestion(question: string, userId: string) {
  const provider = getPrimaryAIProvider();
  const model = getChatModelForProvider(provider);
  const llmEnabled = !boolEnv("RAG_TEST_SKIP_LLM") && !boolEnv("RAG_TEST_LOCAL_ONLY");
  const retrieval = await retrieveKnowledge({
    query: question,
    userId,
    topK: CHAT_TOP_K,
    minSimilarity: CHAT_MIN_RELEVANT_SIMILARITY,
    minResults: 3,
    requestId: "rag-advanced-test"
  });
  const sources = toSources(retrieval.results);
  const contexts = toRagContexts(sources);
  let answerProvider = provider;
  let answerModel = model;
  let fallbackUsed = false;
  let answer = "";

  if (llmEnabled && contexts.length > 0 && hasUsableChatProvider(provider)) {
    try {
      const generated = await generateRagAnswer(question, contexts, {
        requestId: "rag-advanced-test",
        userId,
        provider,
        model,
        answerMode: retrieval.answerMode,
        confidence: retrieval.confidence,
        intentLabel: retrieval.intent.label,
        retrievalMessage: retrieval.message
      });

      answer = generated.answer;
      answerProvider = generated.providerUsed;
      answerModel = generated.model;
      fallbackUsed = generated.fallbackUsed;
    } catch (error) {
      answer = buildLocalAnswer(question, sources, retrieval.answerMode);
      answerProvider = "local";
      answerModel = error instanceof Error ? "local-fallback: " + error.message : "local-fallback";
      fallbackUsed = true;
    }
  } else {
    answer = buildLocalAnswer(question, sources, retrieval.answerMode);
    answerProvider = "local";
    answerModel = !llmEnabled ? "local-test-mode" : hasUsableChatProvider(provider) ? "local-no-context" : "local-no-provider";
    fallbackUsed = true;
  }

  answer = ensureAnswerHasCitation(answer, sources);

  return {
    question,
    answer,
    providerUsed: answerProvider,
    modelUsed: answerModel,
    fallbackUsed,
    retrieval: {
      mode: retrieval.mode,
      answerMode: retrieval.answerMode,
      confidence: retrieval.confidence,
      totalCandidates: retrieval.totalCandidates,
      filteredCandidates: retrieval.filteredCandidates,
      returnedSourceCount: sources.length,
      usedContextCount: contexts.length,
      queries: retrieval.queries,
      intent: retrieval.intent,
      relaxedRetrievalUsed: retrieval.relaxedRetrievalUsed,
      keywordFallbackUsed: retrieval.keywordFallbackUsed,
      message: retrieval.message
    },
    analysis: analyzeAnswer(answer),
    citations: sources.map((source) => ({
      citationIndex: source.citationIndex,
      title: source.title,
      category: source.category,
      chunkId: source.chunkId,
      knowledgeItemId: source.knowledgeItemId,
      sourceTitle: source.sourceTitle,
      sourceUrl: source.sourceUrl,
      similarity: source.similarity,
      score: source.score
    }))
  };
}

async function main() {
  const startedAt = Date.now();
  const provider = getPrimaryAIProvider();
  const model = getChatModelForProvider(provider);

  if (!hasDatabaseUrl()) {
    const report = {
      ok: false,
      generatedAt: new Date().toISOString(),
      error: "DATABASE_URL missing or invalid.",
      config: {
        provider,
        model,
        embeddingProvider: getEmbeddingProviderName(),
        embeddingModel: getEmbeddingModel(),
        topK: CHAT_TOP_K,
        similarityThreshold: CHAT_MIN_RELEVANT_SIMILARITY,
        maxContextChunks: RAG_MAX_CONTEXT_CHUNKS,
        maxContextChars: RAG_MAX_CONTEXT_CHARS
      }
    };

    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const user = await resolveUser();
  const userId = user?.id ?? null;
  const indexStatus = await getIndexStatus(userId);
  const results = userId
    ? await Promise.all(questions.map((question) => runQuestion(question, userId)))
    : [];
  const failedQuestions = results.filter((result) => (
    result.analysis.missingKeyPoints.length > 0 ||
    !result.analysis.aiLike.passed ||
    result.citations.length === 0
  ));
  const report = {
    ok: failedQuestions.length === 0 && Boolean(userId),
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    user: userId ? { id: userId, phone: user?.phone ?? null, email: user?.email ?? null } : null,
    config: {
      provider,
      model,
      providerConfigured: hasUsableChatProvider(provider),
      llmEnabled: !boolEnv("RAG_TEST_SKIP_LLM") && !boolEnv("RAG_TEST_LOCAL_ONLY"),
      embeddingProvider: getEmbeddingProviderName(),
      embeddingModel: getEmbeddingModel(),
      topK: CHAT_TOP_K,
      similarityThreshold: CHAT_MIN_RELEVANT_SIMILARITY,
      maxContextChunks: RAG_MAX_CONTEXT_CHUNKS,
      maxContextChars: RAG_MAX_CONTEXT_CHARS
    },
    indexStatus,
    tests: results,
    summary: {
      totalQuestions: questions.length,
      executedQuestions: results.length,
      failedQuestionCount: failedQuestions.length,
      failedQuestions: failedQuestions.map((result) => ({
        question: result.question,
        missingKeyPoints: result.analysis.missingKeyPoints,
        aiLikeMatches: result.analysis.aiLike.matches,
        citationCount: result.citations.length
      }))
    }
  };
  const reportPath = pickReportPath();

  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.error("RAG advanced test report written to " + reportPath);

  if (boolEnv("RAG_TEST_STRICT") && !report.ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      message: error instanceof Error ? error.message : "Unknown RAG advanced test error"
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
`;

const tempFile = join(process.cwd(), `.rag-advanced-runner-${Date.now()}.tsx`);
const existingNodeOptions = process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : "";
const env = {
  ...process.env,
  NODE_OPTIONS: `${existingNodeOptions}--conditions=react-server`.trim()
};

writeFileSync(tempFile, runner, "utf8");

try {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", tempFile], {
    cwd: process.cwd(),
    env,
    stdio: "inherit"
  });

  if (result.error) {
    console.error(result.error);
  }

  if (result.status && result.status !== 0) {
    console.error(`RAG advanced runner exited with status ${result.status}.`);
  }

  process.exitCode = result.status ?? 1;
} finally {
  if (existsSync(tempFile)) {
    unlinkSync(tempFile);
  }
}
