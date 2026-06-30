import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const indexPath = path.join(root, "artifacts", "admin-ingest", "memory", "memory-index.json");
const scope = {
  knowledgeBaseId: "kb-kks-slim",
  kbId: "kb-kks-slim",
  agentId: "expert-kks",
  expertId: "expert-kks",
  namespace: "kb-kks-slim",
  tenantId: "default"
};
const queries = [
  {
    query: "33循环和77循环怎么选",
    expected: /33循环|77循环|怎么选|周期选择/
  },
  {
    query: "KKS怎么使用",
    expected: /KKS|基础目标|信息收集|使用节奏/
  },
  {
    query: "客户说考虑考虑怎么回复",
    expected: /考虑考虑|客户犹豫|自然回复|微信话术/
  },
  {
    query: "控体期间体重波动怎么解释",
    expected: /控体|体重波动|水分|作息/
  },
  {
    query: "脂达人脉达人怎么讲",
    expected: /脂达人|脉达人|控体沟通定位/
  }
];

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
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

function sameScope(entry) {
  return (
    (entry.knowledgeBaseId === scope.knowledgeBaseId || entry.kbId === scope.kbId) &&
    (entry.agentId === scope.agentId || entry.expertId === scope.expertId) &&
    (!entry.namespace || entry.namespace === scope.namespace || entry.namespace === "default") &&
    (!entry.tenantId || entry.tenantId === scope.tenantId || entry.tenantId === "default")
  );
}

function search(entries, query) {
  const queryTokens = tokenize(query);
  return entries
    .filter(sameScope)
    .map((entry) => {
      const tokenSet = new Set(entry.tokens || []);
      const matchedTokens = uniqueTokens(queryTokens.filter((token) => tokenSet.has(token)));
      const tokenScore = queryTokens.length > 0 ? matchedTokens.length / queryTokens.length : 0;
      const titleScore = matchedTokens.some((token) => entry.title.toLowerCase().includes(token)) ? 0.12 : 0;
      const tagScore = (entry.tags || []).some((tag) => matchedTokens.some((token) => tag.toLowerCase().includes(token))) ? 0.08 : 0;
      const score = Number(Math.min(1, tokenScore + titleScore + tagScore).toFixed(3));
      return {
        entry,
        score,
        matchedTokens,
        reason: [
          matchedTokens.length ? `matched token:${matchedTokens.slice(0, 8).join(",")}` : "scope-match",
          "same kb",
          "same agent",
          "namespace compatible",
          "tenant compatible"
        ].join(" | ")
      };
    })
    .filter((item) => item.score > 0.2)
    .sort((left, right) => right.score - left.score);
}

const indexState = readJson(indexPath, { entries: [] });
const entries = Array.isArray(indexState.entries) ? indexState.entries : [];
const results = queries.map((item) => {
  const hits = search(entries, item.query);
  const top = hits[0] || null;
  const combined = top ? `${top.entry.title}\n${top.reason}\n${top.entry.searchText || ""}` : "";
  const pass = Boolean(top && item.expected.test(combined) && top.score > 0.2);
  return {
    query: item.query,
    memoryApplied: hits.length > 0,
    usedMemoryIds: hits.map((hit) => hit.entry.memoryId),
    topTitle: top?.entry.title || "",
    score: top?.score || 0,
    reason: top?.reason || "",
    pass
  };
});
const ok = results.every((item) => item.pass && item.memoryApplied && item.usedMemoryIds.length > 0);

console.log(`KKS_RUNTIME_MEMORY_HIT_OK: ${ok}`);
for (const result of results) {
  console.log(`query: ${result.query}`);
  console.log(`memoryApplied: ${result.memoryApplied}`);
  console.log(`usedMemoryIds: ${result.usedMemoryIds.join(",")}`);
  console.log(`topTitle: ${result.topTitle}`);
  console.log(`score: ${result.score}`);
  console.log(`reason: ${result.reason}`);
  console.log(`pass: ${result.pass}`);
}
