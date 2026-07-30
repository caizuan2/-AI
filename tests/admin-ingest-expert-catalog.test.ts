import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  mapPublicExpertCatalog
} from "../lib/admin-ingest/expert-catalog-client";

const catalog = mapPublicExpertCatalog({
  ok: true,
  data: {
    zones: [
      { zoneKey: "market", displayName: "AI市场专区", sortOrder: 0 },
      { zoneKey: "zone-custom", displayName: "新建专区", sortOrder: 1 }
    ],
    agents: [
      {
        agentKey: "expert-health",
        displayName: "健康顾问",
        knowledgeBaseId: "kb-must-not-replace-health",
        namespace: "kb-must-not-replace-health",
        zoneKey: "market",
        sortOrder: 0,
        aliases: ["大健康专家"],
        description: "后台修改后的展示说明。"
      },
      {
        agentKey: "expert-career",
        displayName: "事业顾问",
        knowledgeBaseId: "kb-must-not-replace-career",
        namespace: "kb-must-not-replace-career",
        zoneKey: "market",
        sortOrder: 1,
        aliases: ["讲事业导师"]
      },
      {
        agentKey: "expert-slim-kks",
        displayName: "KKS 顾问",
        knowledgeBaseId: "kb-must-not-replace-kks",
        namespace: "kb-must-not-replace-kks",
        zoneKey: "market",
        sortOrder: 2,
        aliases: ["瘦身KKS专业师"]
      },
      {
        agentKey: "expert-custom-fixed",
        displayName: "新 Agent",
        knowledgeBaseId: "kb-custom-fixed",
        namespace: "kb-custom-fixed",
        zoneKey: "zone-custom",
        sortOrder: 0,
        aliases: []
      }
    ]
  }
});

assert.equal(catalog.source, "remote");
assert.deepEqual(catalog.zones.map((zone) => zone.label), [
  "AI市场专区",
  "新建专区"
]);

const protectedHealth = catalog.experts.find((expert) => expert.id === "expert-health");
assert.equal(protectedHealth?.name, "健康顾问");
assert.equal(protectedHealth?.knowledgeBaseId, "kb-health-expert");
assert.equal(protectedHealth?.namespace, "kb-health-expert");
assert.equal(
  catalog.experts.find((expert) => expert.id === "expert-career")?.knowledgeBaseId,
  "kb-business-coach"
);
assert.equal(
  catalog.experts.find((expert) => expert.id === "expert-slim-kks")?.knowledgeBaseId,
  "kb-kks-slim"
);

const customExpert = catalog.experts.find((expert) => expert.id === "expert-custom-fixed");
assert.equal(customExpert?.zoneTitle, "新建专区");
assert.equal(customExpert?.knowledgeBaseId, "kb-custom-fixed");
assert.equal(customExpert?.namespace, "kb-custom-fixed");

const invalidCatalog = mapPublicExpertCatalog({
  ok: true,
  data: {
    zones: [],
    agents: []
  }
});
assert.equal(invalidCatalog.source, "fallback");
assert.ok(invalidCatalog.experts.some((expert) => expert.id === "expert-career"));

const root = process.cwd();
const tabsSource = readFileSync(
  path.join(root, "components/enterprise-admin/IngestExpertTabs.tsx"),
  "utf8"
);
const modeSource = readFileSync(
  path.join(root, "components/enterprise-admin/IngestModeToggle.tsx"),
  "utf8"
);
const marketplaceSource = readFileSync(
  path.join(root, "components/enterprise-admin/IngestExpertMarketplace.tsx"),
  "utf8"
);

assert.match(tabsSource, /isAdded \? onRemoveExpert\(expert\) : onAddExpert\(expert\)/);
assert.match(tabsSource, /isAdded \? "取消" : "添加"/);
assert.match(modeSource, /agent\.source === "expert_marketplace"/);
assert.match(modeSource, /handleRequestDeleteAgent\(existing\.id\)/);
assert.match(modeSource, /handleRequestDeleteAgent[\s\S]*removeAgentFromWorkspace\(target\)/);
assert.doesNotMatch(modeSource, /<IngestAgentDeleteDialog/);
assert.match(modeSource, /agent\.name === expert\.name/);
assert.match(marketplaceSource, />AI专家广场<\/h1>/);
assert.doesNotMatch(
  modeSource,
  /handleExpertCatalogResolved[\s\S]*knowledgeBaseId:\s*expert\.knowledgeBaseId/
);

console.log("admin ingest expert catalog tests passed");
