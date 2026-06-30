import fs from "node:fs";
import path from "node:path";

const SEED_SET_ID = "kks-33-77-runtime-seed-v1";
const SOURCE = "admin-ingest-runtime-seed-v1";
const COMPLIANCE = "仅用于知识库业务测试，不作为医疗建议，不替代医生诊断或治疗。";
const root = process.cwd();
const memoryDir = path.join(root, "artifacts", "admin-ingest", "memory");
const publishedPath = path.join(memoryDir, "memory-published.json");
const indexPath = path.join(memoryDir, "memory-index.json");
const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--write") && !args.has("--clear-seed");
const clearSeed = args.has("--clear-seed");
const now = Date.now();

const scope = {
  knowledgeBaseId: "kb-kks-slim",
  kbId: "kb-kks-slim",
  agentId: "expert-kks",
  expertId: "expert-kks",
  namespace: "kb-kks-slim",
  tenantId: "default"
};

const seedDefinitions = [
  {
    id: "seed-kks-basic-goal",
    type: "strategy",
    title: "KKS控体沟通的基础目标",
    tags: ["KKS", "控体", "客户基础", "目标", "周期安排", "怎么使用"],
    content: "客户问KKS怎么使用时，要先说明KKS控体沟通的基础目标：先了解客户当前基础，不直接固定方案。先判断客户饮食、作息、体重管理目标，让客户理解周期安排，再进入具体建议。沟通时不要承诺固定效果，只强调根据基础评估和持续跟进。"
  },
  {
    id: "seed-kks-33-scenario",
    type: "faq",
    title: "33循环适用场景",
    tags: ["33循环", "3天", "启动", "轻量", "短周期", "客户基础"],
    content: "33循环适合刚开始了解方案、基础较轻、需要先体验节奏的客户。重点不是承诺几天见效，而是让客户先建立执行节奏。可以先做轻启动，再根据反馈调整。"
  },
  {
    id: "seed-kks-77-scenario",
    type: "faq",
    title: "77循环适用场景",
    tags: ["77循环", "7天", "过渡", "稳定", "适应期", "周期"],
    content: "77循环适合需要更完整过渡、饮食习惯较乱、需要更长适应期的客户。重点是让身体和作息逐步适应方案，适合做更稳妥的周期管理。"
  },
  {
    id: "seed-kks-33-77-choice",
    type: "faq",
    title: "33循环和77循环怎么选",
    tags: ["33循环", "77循环", "怎么选", "客户选择", "周期选择"],
    content: "如果客户基础较好、想先轻量尝试，可以从33循环开始。如果客户饮食作息不规律、担心适应困难，可以选77循环。两者不是简单谁更快，而是根据客户基础和执行稳定性选择。给客户讲时要强调先适合，再坚持。"
  },
  {
    id: "seed-kks-33-77-script",
    type: "script",
    title: "给客户讲33循环和77循环的客户话术",
    tags: ["客户话术", "微信回复", "33", "77", "怎么说"],
    content: "33和77不是简单分好坏，也不是越快越好。33更像是先轻启动，适合想先体验节奏、基础相对简单的客户；77更像是稳一点的过渡周期，适合饮食作息不规律、需要更多适应时间的客户。我们先看你的基础情况，再帮你选更适合你的方式，这样执行起来也更稳。"
  },
  {
    id: "seed-kks-weight-fluctuation",
    type: "faq",
    title: "控体期间体重波动怎么解释",
    tags: ["体重波动", "涨了", "水分", "作息", "饮食", "焦虑", "控体"],
    content: "控体期间体重短期波动常和水分、盐分、作息、排便、饮食节奏有关。不要用一天两天的数据判断整个方案。建议按周期看趋势，而不是盯每天数字。如果波动明显，先复盘饮食、饮水、睡眠和执行情况。"
  },
  {
    id: "seed-kks-consider-reply",
    type: "script",
    title: "客户说考虑考虑的自然回复",
    tags: ["考虑考虑", "客户犹豫", "跟进", "微信话术"],
    content: "可以的，你先不用急着决定。这个方案不是靠冲动做决定，还是要看你现在的基础、目标和能不能配合执行。你可以先想一下自己最想改善的是体重、状态，还是饮食习惯。我这边也可以先帮你把适合你的周期和注意事项整理清楚，你再判断要不要开始。"
  },
  {
    id: "seed-kks-compliance-risk",
    type: "risk",
    title: "KKS沟通合规边界",
    tags: ["合规", "风险", "不能承诺", "医疗", "疾病", "效果", "KKS"],
    content: "KKS沟通不承诺固定减重数字，不说治疗疾病，不替代医生建议。涉及糖尿病、高血压、孕期、哺乳期、严重基础疾病时，建议客户先咨询专业医生。对外沟通要强调健康管理、饮食作息调整和执行配合。"
  },
  {
    id: "seed-kks-info-sop",
    type: "sop",
    title: "KKS执行前客户信息收集SOP",
    tags: ["SOP", "信息收集", "客户基础", "执行前", "KKS"],
    content: "KKS执行前先了解客户目标，包括体重、围度、状态、饮食习惯；再了解睡眠、工作压力、运动情况；继续了解三餐、夜宵、甜食、饮水；还要确认孕期、哺乳期、特殊疾病或用药等禁忌；最后根据基础判断周期，不直接套固定方案。"
  },
  {
    id: "seed-kks-followup-sop",
    type: "sop",
    title: "KKS后续跟进SOP",
    tags: ["跟进", "复盘", "执行", "反馈", "SOP", "KKS"],
    content: "KKS后续跟进第一天确认客户是否理解使用节奏；中途关注饮食、饮水、作息和感受；遇到体重波动先安抚，再复盘执行；周期结束后总结变化和问题；最后根据反馈调整下一阶段建议。"
  },
  {
    id: "seed-kks-product-positioning",
    type: "strategy",
    title: "脂达人脉达人控体沟通定位",
    tags: ["脂达人", "脉达人", "控体", "产品定位", "沟通"],
    content: "脂达人、脉达人和控体沟通时不要把产品讲成药物，更适合从饮食管理、周期节奏、执行配合角度说明。避免夸大效果，重点讲客户基础、执行动作和跟进复盘。涉及健康问题时加边界说明。"
  },
  {
    id: "seed-kks-must-choose-33-77",
    type: "faq",
    title: "客户问必须选33还是77怎么回答",
    tags: ["必须选", "33", "77", "客户疑问", "33循环", "77循环"],
    content: "不一定非要一开始就定死。33和77只是不同节奏的安排，关键还是看你的基础和接受程度。我们可以先看你的饮食、作息和目标，再判断是先轻启动，还是直接做更完整的过渡周期。"
  }
];

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

function uniqueTokens(tokens) {
  return Array.from(new Set(tokens.map((token) => token.trim().toLowerCase()).filter(Boolean)));
}

function collectSpecialTokens(text) {
  return (text.match(/33\s*循环|77\s*循环|kks|脂达人|脉达人|控体|瘦身|考虑考虑/gi) || [])
    .map((item) => item.toLowerCase().replace(/\s+/g, ""));
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
  return uniqueTokens(tokens);
}

function toMemory(seed) {
  const publishedAt = now;
  return {
    id: `pub-${seed.id}`,
    sourceDraftId: seed.id,
    title: seed.title,
    type: seed.type,
    content: seed.content,
    summary: seed.content.slice(0, 160),
    tags: seed.tags,
    status: "published",
    visibility: "shared",
    confidence: 0.95,
    ...scope,
    sourceApp: "admin_ingest",
    createdAt: publishedAt,
    publishedAt,
    updatedAt: publishedAt,
    meta: {
      seed: true,
      seedSetId: SEED_SET_ID,
      source: SOURCE,
      compliance: COMPLIANCE,
      scopeResolvedBy: "kks-runtime-seed-v1"
    }
  };
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

const state = readJson(publishedPath, {
  source: "admin-ingest-memory-publisher-v1",
  version: 1,
  updatedAt: now,
  memories: []
});
const existingMemories = Array.isArray(state.memories) ? state.memories : [];
const existingSeedCount = existingMemories.filter((memory) => memory.meta?.seedSetId === SEED_SET_ID).length;
const seedMemories = seedDefinitions.map(toMemory);
const seedIds = seedMemories.map((memory) => memory.id);
let nextMemories = existingMemories;
let newSeedCount = 0;
const warnings = [];

if (clearSeed) {
  nextMemories = existingMemories.filter((memory) => memory.meta?.seedSetId !== SEED_SET_ID);
  warnings.push("clear-seed 只移除当前 seedSetId 的测试数据。");
} else {
  const existingIds = new Set(existingMemories.map((memory) => memory.id));
  const hasSeedSet = existingSeedCount > 0;
  const seedsToAdd = hasSeedSet ? [] : seedMemories.filter((memory) => !existingIds.has(memory.id));
  newSeedCount = seedsToAdd.length;
  nextMemories = [...existingMemories, ...seedsToAdd];
  if (hasSeedSet) warnings.push("seedSetId 已存在，默认跳过重复写入。");
}

const entries = buildIndex(nextMemories);

if (!dryRun) {
  writeJson(publishedPath, {
    source: "admin-ingest-memory-publisher-v1",
    version: 1,
    updatedAt: now,
    memories: nextMemories
  });
  writeJson(indexPath, {
    source: "admin-ingest-memory-index-builder-v1",
    version: 1,
    builtAt: now,
    entries,
    warnings: nextMemories.length > 0 && entries.length === 0 ? ["INDEX_BUILD_FAILED: published memory exists but no index entry was built."] : []
  });
}

console.log(`SEED_SET_ID: ${SEED_SET_ID}`);
console.log(`DRY_RUN: ${dryRun}`);
console.log(`existingSeedCount: ${existingSeedCount}`);
console.log(`newSeedCount: ${newSeedCount}`);
console.log(`publishedTotalAfter: ${nextMemories.length}`);
console.log(`indexedCountAfter: ${entries.length}`);
console.log(`seedIds: ${seedIds.join(",")}`);
console.log(`warnings: ${warnings.join(" | ")}`);
