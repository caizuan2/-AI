import assert from "node:assert/strict";

import {
  ADMIN_INGEST_MODEL_STORAGE_KEY,
  DEFAULT_INGEST_MODEL_OPTION,
  INGEST_DEFAULT_DEEPSEEK_PROVIDER,
  getIngestModelOptionByProvider,
  normalizeIngestModelSelection,
  resolveIngestActualModel,
  sanitizeIngestPreferredModel
} from "../lib/enterprise/ingest-model-options";
import {
  buildEnterpriseFallbackChain,
  unifiedRouter
} from "../lib/enterprise/gpt-os-model-router-v2";
import { resolveAdminIngestModelProvider } from "../lib/enterprise/ingest-model-provider";

const presentationAttachment = [{
  fileName: "training-course.pptx",
  mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
}];

assert.equal(
  INGEST_DEFAULT_DEEPSEEK_PROVIDER,
  "deepseek-pro",
  "Every admin-ingest expert should start with DeepSeek Pro as the main model."
);
assert.equal(DEFAULT_INGEST_MODEL_OPTION.provider, "deepseek-pro");
assert.equal(getIngestModelOptionByProvider("deepseek-pro").defaultModel, "deepseek-v4-pro");
assert.equal(getIngestModelOptionByProvider("deepseek-flash").defaultModel, "deepseek-v4-flash");
assert.match(
  ADMIN_INGEST_MODEL_STORAGE_KEY,
  /deepseek-pro-primary-v1$/,
  "The storage key must be versioned so browsers with a legacy Flash selection migrate to the new Pro default."
);
assert.equal(normalizeIngestModelSelection({}).provider, "deepseek-pro");

const originalDeepSeekEnv = {
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
  DEEPSEEK_PRO_MODEL: process.env.DEEPSEEK_PRO_MODEL,
  DEEPSEEK_FLASH_MODEL: process.env.DEEPSEEK_FLASH_MODEL
};

try {
  delete process.env.DEEPSEEK_MODEL;
  delete process.env.DEEPSEEK_PRO_MODEL;
  delete process.env.DEEPSEEK_FLASH_MODEL;

  assert.equal(resolveIngestActualModel("deepseek-pro"), "deepseek-v4-pro");
  assert.equal(resolveIngestActualModel("deepseek-flash"), "deepseek-v4-flash");

  process.env.DEEPSEEK_PRO_MODEL = "deepseek-chat";
  process.env.DEEPSEEK_FLASH_MODEL = "deepseek-reasoner";
  assert.equal(
    resolveIngestActualModel("deepseek-pro"),
    "deepseek-v4-pro",
    "The retired deepseek-chat alias must not make the Pro label call Flash."
  );
  assert.equal(resolveIngestActualModel("deepseek-flash"), "deepseek-v4-flash");
  assert.equal(sanitizeIngestPreferredModel("deepseek-chat"), "");
  assert.equal(sanitizeIngestPreferredModel("deepseek-reasoner"), "");
} finally {
  for (const [name, value] of Object.entries(originalDeepSeekEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

assert.equal(
  unifiedRouter({
    attachments: presentationAttachment,
    selectedModelLabel: "DeepSeek-V4-Pro",
    preferredModel: "deepseek-pro"
  }),
  "deepseek-pro",
  "An explicit DeepSeek Pro selection must remain the final main model for PPT evidence."
);
assert.equal(
  unifiedRouter({
    input: "请批量整理成知识草稿并生成完整正文",
    costMode: "low",
    selectedModelLabel: "DeepSeek-V4-Pro",
    preferredModel: "deepseek-pro"
  }),
  "deepseek-pro",
  "Batch and low-cost hints must not override the explicit Pro main-model policy."
);
assert.equal(
  unifiedRouter({
    input: "请归纳这批中文资料",
    selectedModelLabel: "DeepSeek-V4-Pro"
  }),
  "deepseek-pro"
);
assert.equal(
  resolveAdminIngestModelProvider({
    modelProvider: "deepseek-pro",
    selectedModelLabel: "DeepSeek-V4-Pro",
    attachments: presentationAttachment
  }).provider,
  "deepseek-pro",
  "The real provider resolver must preserve the Pro main model for attachment requests."
);

assert.equal(
  unifiedRouter({
    attachments: presentationAttachment,
    selectedModelLabel: "Kimi-K2.7-Code-HighSpeed",
    preferredModel: "kimi"
  }),
  "kimi",
  "The long-document model must remain available as an explicit specialist override."
);
assert.equal(
  unifiedRouter({ selectedModelLabel: "Qwen Plus", preferredModel: "qwen" }),
  "qwen"
);
assert.equal(
  unifiedRouter({ selectedModelLabel: "DeepSeek-V4-Flash", preferredModel: "deepseek-flash" }),
  "deepseek-flash"
);
assert.equal(
  unifiedRouter({ attachments: presentationAttachment }),
  "kimi",
  "Automatic document routing must remain available when no fixed main model is supplied."
);
assert.equal(
  unifiedRouter({ input: "请快速生成批量草稿", costMode: "low" }),
  "deepseek-flash",
  "Automatic low-cost routing must remain available when no fixed main model is supplied."
);

assert.deepEqual(
  buildEnterpriseFallbackChain("deepseek-pro"),
  ["deepseek-pro", "qwen", "kimi", "deepseek-flash"],
  "DeepSeek Pro must keep independent-provider fallbacks instead of becoming a single point of failure."
);

console.log("Admin ingest DeepSeek Pro routing tests passed.");
