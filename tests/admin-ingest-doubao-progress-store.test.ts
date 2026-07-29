import assert from "node:assert/strict";

import {
  beginAdminIngestDoubaoProgress,
  readAdminIngestDoubaoProgress,
  updateAdminIngestDoubaoProgress
} from "@/lib/enterprise/admin-ingest-doubao-progress-store";

const requestId = `doubao-progress-${Date.now()}`;
const actorId = "admin-progress-test";
const historyScope = "history-scope-progress-test";
const rawProviderMarkdown = "# 豆包原文\n\n首段保留空格。  \n第二段**不改写**。\n";

beginAdminIngestDoubaoProgress({ requestId, actorId, historyScope });

const pending = readAdminIngestDoubaoProgress({ requestId, actorId, historyScope });
assert.equal(pending?.phase, "pending", "A newly registered request must expose a pending state.");
assert.equal(pending?.replyMarkdown, "", "A newly registered request must expose no visible content.");

updateAdminIngestDoubaoProgress(requestId, {
  phase: "visible",
  replyMarkdown: rawProviderMarkdown,
  actualModel: "doubao-seed-2-1-pro-260628",
  responseId: "doubao-progress-response"
});

const visible = readAdminIngestDoubaoProgress({ requestId, actorId, historyScope });
assert.equal(visible?.phase, "visible");
assert.equal(visible?.replyMarkdown, rawProviderMarkdown, "Progress polling must return the provider Markdown unchanged.");
assert.equal(visible?.actualModel, "doubao-seed-2-1-pro-260628");
assert.equal(
  readAdminIngestDoubaoProgress({ requestId, actorId: "other-admin", historyScope }),
  null,
  "Another administrator must not read the active request progress."
);
assert.equal(
  readAdminIngestDoubaoProgress({ requestId, actorId, historyScope: "other-history-scope" }),
  null,
  "A stale page scope must not read the active request progress."
);

console.log("Admin ingest Doubao progress store tests passed.");
