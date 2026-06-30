import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const memoryDir = path.join(root, "artifacts", "admin-ingest", "memory");
const draftsPath = path.join(memoryDir, "memory-drafts.json");
const publishedPath = path.join(memoryDir, "memory-published.json");
const indexPath = path.join(memoryDir, "memory-index.json");
const now = Date.now();

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeText(value) {
  return readString(value).replace(/\s+/g, " ");
}

function inferScope(draft) {
  const text = [
    draft.id,
    draft.title,
    draft.summary,
    draft.content,
    draft.category,
    draft.agentId,
    draft.meta?.agentId,
    draft.meta?.expertId,
    ...(draft.tags || [])
  ].filter(Boolean).join("\n");

  if (/KKS|kks|33\s*循环|77\s*循环|瘦身|脂达人|脉达人|控体/.test(text)) {
    return {
      knowledgeBaseId: "kb-kks-slim",
      kbId: "kb-kks-slim",
      agentId: "expert-kks",
      expertId: "expert-kks",
      namespace: "kb-kks-slim",
      tenantId: "default",
      reason: "matched-kks-slim-keywords"
    };
  }

  if (/事业|同行|讲事业|招商|成交|裂变|同频|合作|客户开发|伙伴|expert-agent-expert-career/.test(text)) {
    return {
      knowledgeBaseId: "kb-business-coach",
      kbId: "kb-business-coach",
      agentId: "expert-business",
      expertId: "expert-business",
      namespace: "kb-business-coach",
      tenantId: "default",
      reason: "matched-business-coach-keywords"
    };
  }

  if (/大健康|健康|体重管理/.test(text)) {
    return {
      knowledgeBaseId: "kb-health-expert",
      kbId: "kb-health-expert",
      agentId: "expert-health",
      expertId: "expert-health",
      namespace: "kb-health-expert",
      tenantId: "default",
      reason: "matched-health-expert-keywords"
    };
  }

  return null;
}

function canPublish(draft) {
  const title = readString(draft.title);
  const content = readString(draft.content);
  const metaStatus = readString(draft.meta?.status).toLowerCase();
  const scope = inferScope(draft);

  if (!title || !content) return { ok: false, reason: "missing content", scope };
  if (draft.status === "rejected" || metaStatus === "rejected") return { ok: false, reason: "rejected", scope };
  if (metaStatus === "conflict" || metaStatus === "failed") return { ok: false, reason: metaStatus, scope };
  if (draft.meta?.doNotPublish === true || draft.meta?.internalOnly === true) return { ok: false, reason: "doNotPublish/internalOnly", scope };
  if (!scope) return { ok: false, reason: "missing scope", scope };
  if (typeof draft.confidence === "number" && draft.confidence < 0.3) return { ok: false, reason: "low confidence", scope };
  return { ok: true, reason: draft.status === "draft" ? "draft with complete scope" : "saved/confirmed", scope };
}

function toPublished(draft, policy) {
  const scope = policy.scope;
  const persistedScope = {
    knowledgeBaseId: scope.knowledgeBaseId,
    kbId: scope.kbId,
    agentId: scope.agentId,
    expertId: scope.expertId,
    namespace: scope.namespace,
    tenantId: scope.tenantId
  };
  const content = readString(draft.content);
  const title = readString(draft.title) || "未命名训练记忆";
  const id = `pub-${stableHash(`${draft.id}|${scope.knowledgeBaseId}|${scope.agentId}|${content}`)}`;

  return {
    id,
    sourceDraftId: draft.id,
    title,
    summary: readString(draft.summary) || normalizeText(content).slice(0, 160),
    content,
    tags: Array.isArray(draft.tags) ? draft.tags : [],
    type: draft.type || "training_note",
    status: "published",
    visibility: "shared",
    ...persistedScope,
    sourceApp: "admin_ingest",
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    meta: {
      ...(draft.meta || {}),
      originalStatus: draft.status,
      publishReason: policy.reason,
      scopeResolvedBy: "ingest-memory-scope-normalizer-v1",
      scopeResolveReason: scope.reason,
    }
  };
}

function collectSpecialTokens(text) {
  return (text.match(/33\s*循环|77\s*循环|kks|脂达人|脉达人|控体|瘦身|考虑考虑/gi) || []).map((item) => item.toLowerCase().replace(/\s+/g, ""));
}

function tokenize(text) {
  const tokens = collectSpecialTokens(text);
  const coarse = text.match(/[a-z0-9]+|[\u3400-\u9fff]/gi) || [];
  let cjkRun = "";
  let last = "";

  for (const raw of coarse) {
    const token = raw.toLowerCase();
    tokens.push(token);
    if (/^\d+$/.test(last) && /^[\u3400-\u9fff]$/.test(token)) tokens.push(`${last}${token}`);
    if (/^[\u3400-\u9fff]$/.test(token)) {
      cjkRun += token;
      last = token;
      continue;
    }
    for (let index = 0; index < cjkRun.length - 1; index += 1) tokens.push(cjkRun.slice(index, index + 2));
    cjkRun = "";
    last = token;
  }
  for (let index = 0; index < cjkRun.length - 1; index += 1) tokens.push(cjkRun.slice(index, index + 2));
  return Array.from(new Set(tokens.map((token) => token.trim().toLowerCase()).filter(Boolean)));
}

function buildIndex(memories) {
  return memories
    .filter((memory) => memory.status === "published" || memory.status === "shared")
    .filter((memory) => memory.visibility === "shared" || memory.visibility === "public")
    .filter((memory) => memory.knowledgeBaseId && memory.agentId && memory.content)
    .map((memory) => {
      const searchText = [
        memory.type,
        memory.title,
        memory.summary,
        memory.content,
        ...(memory.tags || []),
        memory.knowledgeBaseId,
        memory.kbId,
        memory.agentId,
        memory.expertId,
        memory.namespace,
        memory.tenantId
      ].filter(Boolean).join("\n");
      return {
        memoryId: memory.id,
        sourceDraftId: memory.sourceDraftId,
        title: memory.title,
        summary: memory.summary,
        contentPreview: memory.content.slice(0, 260),
        tags: memory.tags || [],
        status: memory.status,
        visibility: memory.visibility,
        knowledgeBaseId: memory.knowledgeBaseId,
        kbId: memory.kbId,
        agentId: memory.agentId,
        expertId: memory.expertId,
        namespace: memory.namespace,
        tenantId: memory.tenantId,
        sourceApp: "admin_ingest",
        searchText,
        tokens: tokenize(searchText),
        updatedAt: memory.updatedAt
      };
    });
}

function search(indexEntries, input) {
  const queryTokens = tokenize(input.query);
  return indexEntries
    .filter((entry) => (entry.knowledgeBaseId === input.knowledgeBaseId || entry.kbId === input.knowledgeBaseId) && (entry.agentId === input.agentId || entry.expertId === input.agentId))
    .map((entry) => {
      const tokenSet = new Set(entry.tokens);
      const matchedTokens = Array.from(new Set(queryTokens.filter((token) => tokenSet.has(token))));
      const score = queryTokens.length ? matchedTokens.length / queryTokens.length : 0;
      return { entry, matchedTokens, score: Number(score.toFixed(3)) };
    })
    .filter((item) => item.score >= 0.2)
    .sort((left, right) => right.score - left.score);
}

const draftState = readJson(draftsPath, { drafts: [] });
const drafts = Array.isArray(draftState.drafts) ? draftState.drafts : [];
const diagnostics = drafts.map((draft) => ({ draft, policy: canPublish(draft) }));
const publishable = diagnostics.filter((item) => item.policy.ok);
const publishedState = readJson(publishedPath, { source: "admin-ingest-memory-publish-v1", version: 1, memories: [], updatedAt: now });
const existing = Array.isArray(publishedState.memories) ? publishedState.memories : [];
const nextMemories = existing.map((memory) => {
  const { reason, ...rest } = memory;
  void reason;
  return rest;
});
const publishedIds = [];

for (const item of publishable) {
  const published = toPublished(item.draft, item.policy);
  const duplicate = nextMemories.some((memory) => memory.sourceDraftId === published.sourceDraftId || (memory.knowledgeBaseId === published.knowledgeBaseId && memory.agentId === published.agentId && stableHash(normalizeText(memory.content)) === stableHash(normalizeText(published.content))));
  if (!duplicate) {
    nextMemories.push(published);
    publishedIds.push(published.id);
  }
}

writeJson(publishedPath, {
  source: "admin-ingest-memory-publisher-v1",
  version: 1,
  updatedAt: now,
  memories: nextMemories
});

const entries = buildIndex(nextMemories);
writeJson(indexPath, {
  source: "admin-ingest-memory-index-builder-v1",
  version: 1,
  builtAt: now,
  entries,
  warnings: nextMemories.length > 0 && entries.length === 0 ? ["INDEX_BUILD_FAILED: published memory exists but no index entry was built."] : []
});

const kksHits = search(entries, {
  query: "33循环和77循环怎么选",
  knowledgeBaseId: "kb-kks-slim",
  agentId: "expert-kks"
});
const businessHits = search(entries, {
  query: "招商成交同频沟通怎么做",
  knowledgeBaseId: "kb-business-coach",
  agentId: "expert-business"
});
const hasKksSource = drafts.some((draft) => /KKS|kks|33\s*循环|77\s*循环|瘦身|脂达人|脉达人|控体/.test(JSON.stringify(draft)));
const memoryApplied = kksHits.length > 0;
const ok = publishable.length > 0 && nextMemories.length > 0 && entries.length > 0 && memoryApplied;
const rootCauseIfFail = ok
  ? ""
  : !hasKksSource
    ? "当前 memory-drafts.json 没有 KKS/33/77/瘦身/脂达人/脉达人/控体 源内容；发布和索引已修通，但指定 KKS 查询缺少可命中的源数据。"
    : kksHits.length === 0
      ? "KKS source exists but runtime search did not hit."
      : "publish/index prerequisites failed.";

console.log(`MEMORY_PUBLISH_INDEX_OK: ${ok}`);
console.log(`draftCount: ${drafts.length}`);
console.log(`publishableCount: ${publishable.length}`);
console.log(`publishedCount: ${nextMemories.length}`);
console.log(`indexedCount: ${entries.length}`);
console.log(`searchHitCount: ${kksHits.length}`);
console.log(`memoryApplied: ${memoryApplied}`);
console.log(`usedMemoryIds: ${kksHits.map((item) => item.entry.memoryId).join(",") || ""}`);
console.log(`businessSearchHitCount: ${businessHits.length}`);
console.log(`businessUsedMemoryIds: ${businessHits.map((item) => item.entry.memoryId).join(",") || ""}`);
console.log(`rootCauseIfFail: ${rootCauseIfFail}`);
