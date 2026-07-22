import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  parseUploadedFileForGpt,
  type AdminIngestFileModelAffinity,
  type IngestUploadState
} from "../lib/enterprise/ingest-client";

const DEEPSEEK_AFFINITY: AdminIngestFileModelAffinity = {
  modelProvider: "deepseek-pro",
  preferredModel: "deepseek-v4-pro",
  selectedModelLabel: "DeepSeek-V4-Pro",
  strictModelAffinity: true
};

const DOUBAO_AFFINITY: AdminIngestFileModelAffinity = {
  modelProvider: "doubao-pro",
  preferredModel: "doubao-seed-2-1-pro-260628",
  selectedModelLabel: "Doubao-Seed-2.1-pro",
  strictModelAffinity: true
};

function createUpload(): IngestUploadState {
  const rawFile = new File(["投喂附件正文"], "沟通五步.txt", { type: "text/plain" });

  return {
    id: "file-affinity-test",
    fileName: rawFile.name,
    fileType: rawFile.type,
    fileSize: rawFile.size,
    rawFile,
    status: "pending_parse",
    source: "admin_ingest",
    platform: "web",
    syncTarget: ["web"],
    createdAt: new Date(0).toISOString()
  };
}

async function testClientTransmitsSelectedAgentModelIdentity() {
  const originalFetch = globalThis.fetch;
  const requestBodies: FormData[] = [];

  globalThis.fetch = async (_input, init) => {
    if (init?.body instanceof FormData) {
      requestBodies.push(init.body);
    }

    return new Response(JSON.stringify({
      ok: true,
      data: {
        fileName: "沟通五步.txt",
        fileType: "text/plain",
        mimeType: "text/plain",
        sizeBytes: 24,
        parseStatus: "parsed",
        extractedText: "投喂附件正文",
        pageSummaries: [],
        slideTexts: [],
        limitationNote: ""
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const doubaoResult = await parseUploadedFileForGpt(createUpload(), DOUBAO_AFFINITY);
    const deepSeekResult = await parseUploadedFileForGpt(createUpload(), DEEPSEEK_AFFINITY);
    const doubaoRequestBody = requestBodies[0];
    const deepSeekRequestBody = requestBodies[1];

    assert.equal(doubaoResult.parseStatus, "parsed");
    assert.equal(deepSeekResult.parseStatus, "parsed");
    assert.ok(doubaoRequestBody);
    assert.equal(doubaoRequestBody.get("modelProvider"), "doubao-pro");
    assert.equal(doubaoRequestBody.get("preferredModel"), "doubao-seed-2-1-pro-260628");
    assert.equal(doubaoRequestBody.get("selectedModelLabel"), "Doubao-Seed-2.1-pro");
    assert.equal(doubaoRequestBody.get("strictModelAffinity"), "true");
    assert.ok(deepSeekRequestBody);
    assert.equal(deepSeekRequestBody.get("modelProvider"), "deepseek-pro");
    assert.equal(deepSeekRequestBody.get("preferredModel"), "deepseek-v4-pro");
    assert.equal(deepSeekRequestBody.get("selectedModelLabel"), "DeepSeek-V4-Pro");
    assert.equal(deepSeekRequestBody.get("strictModelAffinity"), "true");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function testServerAcceptsOnlyExactStrictWebModelIdentity() {
  const routeSource = readFileSync(
    path.join(process.cwd(), "app/api/admin/kb/ingest/files/parse/route.ts"),
    "utf8"
  );

  assert.match(routeSource, /STRICT_WEB_INGEST_PROVIDERS[\s\S]*"deepseek-pro"[\s\S]*"doubao-pro"/);
  assert.match(routeSource, /strictValue !== "true" && strictValue !== "false"/);
  assert.match(routeSource, /preferredModel !== selectedOption\.defaultModel/);
  assert.match(routeSource, /selectedModelLabel !== selectedOption\.label/);
  assert.match(routeSource, /modelAffinity = readAdminIngestParseModelAffinity\(formData\)/);
  assert.match(routeSource, /\{ \.\.\.parsed, modelAffinity \}/);
}

function testComposerUsesStrictSelectedModelForAttachmentParsing() {
  const source = readFileSync(
    path.join(process.cwd(), "components/enterprise-admin/IngestModeToggle.tsx"),
    "utf8"
  );

  assert.match(source, /parseUploadedFilesForGpt\(composerUploads, 1, \{/);
  assert.match(source, /modelProvider:\s*selectedFileModelProvider/);
  assert.match(source, /preferredModel:\s*requestModelOption\.defaultModel/);
  assert.match(source, /selectedModelLabel:\s*requestModelOption\.label/);
  assert.match(source, /strictModelAffinity:\s*true/);
  assert.match(source, /signal:\s*abortController\.signal/);
  assert.match(source, /pageBatchSize:\s*4/);
  assert.match(source, /onProgress:\s*\(progress\)/);
}

async function main() {
  await testClientTransmitsSelectedAgentModelIdentity();
  testServerAcceptsOnlyExactStrictWebModelIdentity();
  testComposerUsesStrictSelectedModelForAttachmentParsing();

  console.log("admin ingest attachment model-affinity tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
