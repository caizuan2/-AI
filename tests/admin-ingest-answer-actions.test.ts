import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actionsSource = readFileSync(
  "components/enterprise-admin/IngestKnowledgeDraftActions.tsx",
  "utf8"
);
const feedbackSource = readFileSync(
  "components/enterprise-admin/IngestAnswerFeedbackActions.tsx",
  "utf8"
);

assert.match(
  actionsSource,
  /<div className="relative hidden" aria-hidden="true">[\s\S]*?title="来源"[\s\S]*?aria-label="来源"/,
  "来源入口应保留数据链路，但在投喂端回答操作栏中隐藏。"
);
assert.match(
  actionsSource,
  /<span className="hidden" aria-hidden="true">[\s\S]*?title="继续优化"[\s\S]*?aria-label="继续优化"[\s\S]*?<\/span>/,
  "继续优化入口应在投喂端回答操作栏中隐藏。"
);

assert.match(actionsSource, /title="复制" aria-label="复制"/);
assert.match(actionsSource, /title=\{saveTitle\}[\s\S]*?aria-label=\{saveTitle\}/);
assert.match(actionsSource, /title=\{isParsing \? "生成中" : "重新生成"\}/);
assert.match(actionsSource, /border-\[#f2ddb0\][\s\S]*?text-\[#d28700\]/);
assert.match(actionsSource, /hover:bg-\[#fff8e8\]/);

assert.match(
  actionsSource,
  /saveState === "error"[\s\S]*?border-rose-200 text-\[#b93b4a\]/,
  "保存失败必须继续使用红色错误状态。"
);
assert.match(
  actionsSource,
  /disabled:text-\[#aaa\]/,
  "禁用状态必须继续保持灰色。"
);
assert.match(actionsSource, /\{feedbackActions\}/);
assert.match(feedbackSource, /border-\[#f2ddb0\] bg-white\/80 text-\[#d28700\]/);
assert.match(feedbackSource, /border-\[#e4bd62\] bg-\[#fff3d8\] text-\[#9a6500\]/);
assert.match(feedbackSource, /title="有帮助"[\s\S]*?aria-label="有帮助"/);
assert.match(feedbackSource, /title="没帮助"[\s\S]*?aria-label="没帮助"/);

console.log("Admin ingest answer action visibility and color tests passed.");
