import assert from "node:assert/strict";
import {
  ADMIN_INGEST_CONTEXT_LIMITS,
  buildAdminIngestContextRequestFields,
  readAdminIngestContextRequestFields
} from "../lib/enterprise/admin-ingest-context-boundary";

const sentinels = {
  contextSummary: "LONG_CONTEXT_BOUNDARY_TAIL",
  memoryContextText: "MEMORY_BOUNDARY_TAIL",
  agentLearningInstruction: "LEARNING_BOUNDARY_TAIL"
};
const withinLimits = {
  contextSummary: `${"长上下文".repeat(3_000)}${sentinels.contextSummary}`,
  memoryContextText: `${"长期记忆".repeat(800)}${sentinels.memoryContextText}`,
  agentLearningInstruction: `${"学习规则".repeat(500)}${sentinels.agentLearningInstruction}`,
  usedMemoryIds: ["memory-1", "memory-1", "memory-2"]
};
const clientFields = buildAdminIngestContextRequestFields(withinLimits);
const routeFields = readAdminIngestContextRequestFields(clientFields);

assert.ok(routeFields.contextSummary?.endsWith(sentinels.contextSummary));
assert.ok(routeFields.memoryContextText?.endsWith(sentinels.memoryContextText));
assert.ok(routeFields.agentLearningInstruction?.endsWith(sentinels.agentLearningInstruction));
assert.deepEqual(routeFields.usedMemoryIds, ["memory-1", "memory-2"]);

const overLimit = readAdminIngestContextRequestFields({
  contextSummary: "C".repeat(ADMIN_INGEST_CONTEXT_LIMITS.contextSummary + 100),
  memoryContextText: "M".repeat(ADMIN_INGEST_CONTEXT_LIMITS.memoryContextText + 100),
  agentLearningInstruction: "L".repeat(ADMIN_INGEST_CONTEXT_LIMITS.agentLearningInstruction + 100),
  usedMemoryIds: Array.from({ length: 30 }, (_, index) => `memory-${index + 1}`)
});

assert.equal(overLimit.contextSummary?.length, ADMIN_INGEST_CONTEXT_LIMITS.contextSummary);
assert.equal(overLimit.memoryContextText?.length, ADMIN_INGEST_CONTEXT_LIMITS.memoryContextText);
assert.equal(overLimit.agentLearningInstruction?.length, ADMIN_INGEST_CONTEXT_LIMITS.agentLearningInstruction);
assert.equal(overLimit.usedMemoryIds.length, ADMIN_INGEST_CONTEXT_LIMITS.usedMemoryIds);

console.log("admin ingest context API boundary tests passed");
