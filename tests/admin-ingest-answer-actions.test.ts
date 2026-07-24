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
assert.match(actionsSource, /border-\[#e1efff\] bg-\[#f6faff\] text-\[#3b8df5\]/);
assert.match(actionsSource, /hover:border-\[#cfe5ff\] hover:bg-\[#edf6ff\] hover:text-\[#2178df\]/);

assert.match(
  actionsSource,
  /saveState === "error"[\s\S]*?border-rose-200 bg-rose-50 text-\[#b93b4a\]/,
  "保存失败必须继续使用红色错误状态。"
);
assert.match(
  actionsSource,
  /disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400/,
  "禁用状态必须继续保持灰色。"
);
assert.match(actionsSource, /\{feedbackActions\}/);
assert.match(feedbackSource, /border-\[#e1efff\] bg-\[#f6faff\] text-\[#3b8df5\]/);
assert.match(feedbackSource, /border-\[#c8e1ff\] bg-\[#eaf5ff\] text-\[#2178df\]/);
assert.match(feedbackSource, /<ThumbsUp className="h-4 w-4 stroke-\[2\]"/);
assert.match(feedbackSource, /<ThumbsDown className="h-4 w-4 stroke-\[2\]"/);
assert.match(feedbackSource, /title="有帮助"[\s\S]*?aria-label="有帮助"/);
assert.match(feedbackSource, /title="没帮助"[\s\S]*?aria-label="没帮助"/);

console.log("Admin ingest answer action visibility and color tests passed.");
