import assert from "node:assert/strict";
import {
  publicExpertScopeValuesOverlap,
  resolvePublicExpertScope
} from "../lib/enterprise/public-expert-scope";

const CAREER_ALIASES = [
  "expert-career",
  "expert-agent-expert-career",
  "kb-business-coach",
  "kb-career-mentor",
  "kb:expert-agent-expert-career",
  "agent:expert-career:kb:kb-career-mentor",
  "讲事业导师"
];

for (const alias of CAREER_ALIASES) {
  const scope = resolvePublicExpertScope({ knowledgeBaseId: alias });

  assert.deepEqual(scope, {
    knowledgeBaseId: "kb-business-coach",
    kbId: "kb-business-coach",
    agentId: "expert-career",
    expertId: "expert-career",
    namespace: "kb-business-coach",
    tenantId: "default"
  });
}

assert.equal(
  publicExpertScopeValuesOverlap("kb:expert-agent-expert-career", "kb-business-coach"),
  true
);

console.log("admin ingest career scope tests passed");
