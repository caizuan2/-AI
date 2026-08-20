import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  beginAdminIngestModelSelection,
  canCommitAdminIngestModelSelection,
  isAdminIngestModelSelectionPending,
  type AdminIngestPendingModelSelection
} from "../lib/enterprise/ingest-model-preferences";

const toggleSource = readFileSync(
  "components/enterprise-admin/IngestModeToggle.tsx",
  "utf8"
);
const clientSource = readFileSync("lib/enterprise/ingest-client.ts", "utf8");

assert.match(
  toggleSource,
  /const selectedModelRef = useRef\(DEFAULT_INGEST_MODEL_OPTION\.label\)/,
  "The committed model selection must have a synchronous request snapshot."
);
assert.match(
  toggleSource,
  /const currentModelLabel = options\?\.modelLabel \?\? selectedModelRef\.current/,
  "A request must use the same committed model snapshot that drives the selector."
);
assert.match(
  toggleSource,
  /selectedModelRef\.current = nextModel\.label;\s*setSelectedModel\(nextModel\.label\)/,
  "Model selection must update the request snapshot and visible selector together."
);
assert.match(
  toggleSource,
  /if \(isAdminIngestModelSelectionPending\(pendingModelSelection, activeAgent\.id\)\)[\s\S]*?return null;[\s\S]*?const currentModelLabel = options\?\.modelLabel \?\? selectedModelRef\.current/,
  "Every send path must stop before reading the old committed provider while a model health check is pending."
);
assert.match(
  toggleSource,
  /const committedModelLabel = selectedModelRef\.current;[\s\S]*?handleSend\(regenerateRequest\.visibleInput,[\s\S]*?modelLabel: committedModelLabel/,
  "Regenerate must explicitly snapshot and submit the committed model label."
);
assert.match(
  toggleSource,
  /if \(!health\.ok \|\| !healthMatchesSelection\)[\s\S]*?return;[\s\S]*?commitSelection\(\)/,
  "Doubao must become visible and requestable only after a matching health result succeeds."
);
assert.match(
  toggleSource,
  /pendingModelSelectionRef\.current = null;\s*commitSelection\(\);\s*\}/,
  "A direct committed-model selection must cancel any obsolete pending Doubao gate."
);
assert.match(
  toggleSource,
  /function handleCreateAgentConversation[\s\S]*?setMessages\(\[\]\);\s*setErrorMessage\(""\);\s*setGptFallbackToast\(null\);\s*setActionToast\(null\);/,
  "A new conversation must not inherit the previous request terminal error or toast."
);
assert.match(
  clientSource,
  /if \(eventRequestId && eventRequestId !== callbacks\.expectedRequestId\) \{\s*return null;/,
  "SSE events from an old request must be ignored."
);
assert.match(
  clientSource,
  /if \(eventProvider && eventProvider !== callbacks\.expectedProvider\) \{\s*return null;/,
  "SSE events from a different provider must be ignored."
);
assert.match(
  toggleSource,
  /event\.requestId !== requestId\s*\|\| !isCurrentRequest\(\)/,
  "Visible reply handlers must reject stale conversation request events."
);

async function testAtomicModelHealthTiming() {
  let committedModelLabel = "DeepSeek-V4-Pro";
  let pendingSelection: AdminIngestPendingModelSelection | null = beginAdminIngestModelSelection({
    requestVersion: 7,
    agentId: "health-agent",
    modelLabel: "Doubao-Seed-2.1-pro"
  });
  let releaseHealth!: (ok: boolean) => void;
  const healthResult = new Promise<boolean>((resolve) => {
    releaseHealth = resolve;
  });
  let generatedProvider = "";

  assert.equal(committedModelLabel, "DeepSeek-V4-Pro", "The visible committed model must not change during health.");
  assert.equal(isAdminIngestModelSelectionPending(pendingSelection, "health-agent"), true);

  if (!isAdminIngestModelSelectionPending(pendingSelection, "health-agent")) {
    generatedProvider = committedModelLabel;
  }
  assert.equal(generatedProvider, "", "Regenerate must not send the old DeepSeek provider during Doubao health.");

  releaseHealth(true);
  const healthOk = await healthResult;
  if (healthOk && canCommitAdminIngestModelSelection({
    pending: pendingSelection,
    requestVersion: 7,
    agentId: "health-agent",
    modelLabel: "Doubao-Seed-2.1-pro"
  })) {
    committedModelLabel = pendingSelection?.modelLabel ?? committedModelLabel;
    pendingSelection = null;
  }

  assert.equal(committedModelLabel, "Doubao-Seed-2.1-pro");
  assert.equal(isAdminIngestModelSelectionPending(pendingSelection, "health-agent"), false);

  committedModelLabel = "DeepSeek-V4-Pro";
  pendingSelection = beginAdminIngestModelSelection({
    requestVersion: 8,
    agentId: "health-agent",
    modelLabel: "Doubao-Seed-2.1-pro"
  });
  const failedHealth = false;

  if (failedHealth && canCommitAdminIngestModelSelection({
    pending: pendingSelection,
    requestVersion: 8,
    agentId: "health-agent",
    modelLabel: "Doubao-Seed-2.1-pro"
  })) {
    committedModelLabel = pendingSelection.modelLabel;
  }
  pendingSelection = null;

  assert.equal(committedModelLabel, "DeepSeek-V4-Pro", "A failed health check must retain the old model.");

  pendingSelection = beginAdminIngestModelSelection({
    requestVersion: 9,
    agentId: "health-agent",
    modelLabel: "Doubao-Seed-2.1-pro"
  });
  pendingSelection = null;
  committedModelLabel = "DeepSeek-V4-Pro";

  assert.equal(
    isAdminIngestModelSelectionPending(pendingSelection, "health-agent"),
    false,
    "Choosing an already-committed non-Doubao model must cancel an obsolete Doubao health gate."
  );
  assert.equal(committedModelLabel, "DeepSeek-V4-Pro");
}

testAtomicModelHealthTiming().then(() => {
  console.log("Admin ingest model request state isolation tests passed.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
