import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertAgentUpdateDoesNotChangeBinding,
  assertValidKnowledgeBaseId,
  createAgentKey,
  getProtectedExpertBinding,
  normalizeCatalogAliases,
  PROTECTED_EXPERT_BINDINGS
} from "@/lib/super-admin/expert-catalog-policy";

function expectFailure(action: () => unknown, message: RegExp) {
  assert.throws(action, message);
}

assert.deepEqual(PROTECTED_EXPERT_BINDINGS, {
  "expert-health": {
    knowledgeBaseId: "kb-health-expert",
    namespace: "kb-health-expert"
  },
  "expert-career": {
    knowledgeBaseId: "kb-business-coach",
    namespace: "kb-business-coach"
  },
  "expert-slim-kks": {
    knowledgeBaseId: "kb-kks-slim",
    namespace: "kb-kks-slim"
  }
});

assert.equal(
  getProtectedExpertBinding("expert-health")?.knowledgeBaseId,
  "kb-health-expert"
);
assert.equal(
  getProtectedExpertBinding("expert-career")?.knowledgeBaseId,
  "kb-business-coach"
);
assert.equal(
  getProtectedExpertBinding("expert-slim-kks")?.knowledgeBaseId,
  "kb-kks-slim"
);

expectFailure(
  () => assertAgentUpdateDoesNotChangeBinding({ knowledgeBaseId: "kb-other" }),
  /固定知识库绑定/
);
expectFailure(
  () => assertAgentUpdateDoesNotChangeBinding({ namespace: "kb-other" }),
  /固定知识库绑定/
);
expectFailure(
  () => assertAgentUpdateDoesNotChangeBinding({ agentKey: "expert-other" }),
  /固定知识库绑定/
);
assert.doesNotThrow(() =>
  assertAgentUpdateDoesNotChangeBinding({
    displayName: "新的展示名称",
    zoneKey: "market"
  })
);

assert.equal(assertValidKnowledgeBaseId(" KB-CUSTOM-EXPERT "), "kb-custom-expert");
expectFailure(
  () => assertValidKnowledgeBaseId("expert-health"),
  /kb- 开头/
);

assert.deepEqual(
  normalizeCatalogAliases(["讲事业导师", "讲事业专家"], "讲事业导师"),
  ["讲事业导师", "讲事业专家"]
);
assert.deepEqual(
  normalizeCatalogAliases(["讲事业导师", "事业专家"], "讲事业专家"),
  ["讲事业导师", "事业专家", "讲事业专家"]
);
assert.match(createAgentKey("Growth Coach", "ABCDEF12-3456"), /^expert-growth-coach-abcdef12$/);

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
assert.match(schema, /model ExpertCatalogAgent/);
assert.match(schema, /knowledgeBaseId\s+String\s+@unique/);
assert.match(schema, /protectedBinding\s+Boolean/);
assert.match(schema, /onDelete: Restrict/);

const fixedScopeSource = readFileSync(
  resolve(process.cwd(), "lib/enterprise/public-expert-scope.ts"),
  "utf8"
);
assert.match(
  fixedScopeSource,
  /fixedScopeAliases\("expert-health", "kb-health-expert"/
);
assert.match(
  fixedScopeSource,
  /CAREER_EXPERT_KNOWLEDGE_BASE_ID = "kb-business-coach"/
);
assert.match(
  fixedScopeSource,
  /fixedScopeAliases\("expert-kks", "kb-kks-slim"/
);

console.log("super-admin expert catalog policy: PASS");
