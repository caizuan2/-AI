import assert from "node:assert/strict";

import {
  buildAdminIngestOcrCacheKey,
  clearAdminIngestOcrCache,
  readAdminIngestOcrCache,
  writeAdminIngestOcrCache
} from "../lib/enterprise/admin-ingest-ocr-cache";

const originalTtl = process.env.ADMIN_INGEST_OCR_CACHE_TTL_MS;
const originalMaxEntries = process.env.ADMIN_INGEST_OCR_CACHE_MAX_ENTRIES;

function restoreEnvironment() {
  if (originalTtl === undefined) {
    delete process.env.ADMIN_INGEST_OCR_CACHE_TTL_MS;
  } else {
    process.env.ADMIN_INGEST_OCR_CACHE_TTL_MS = originalTtl;
  }

  if (originalMaxEntries === undefined) {
    delete process.env.ADMIN_INGEST_OCR_CACHE_MAX_ENTRIES;
  } else {
    process.env.ADMIN_INGEST_OCR_CACHE_MAX_ENTRIES = originalMaxEntries;
  }
}

function cacheKey(accountScope: string, variant: string, bytes = "same-image") {
  return buildAdminIngestOcrCacheKey({
    accountScope,
    bytes: Buffer.from(bytes),
    variant,
    pipelineVersion: "test-v1"
  });
}

function main() {
  try {
    process.env.ADMIN_INGEST_OCR_CACHE_TTL_MS = "1000";
    process.env.ADMIN_INGEST_OCR_CACHE_MAX_ENTRIES = "2";
    clearAdminIngestOcrCache();

    const accountAFull = cacheKey("account-a", "wechat:full_answer");
    const accountAFullAgain = cacheKey("account-a", "wechat:full_answer");
    const accountAReply = cacheKey("account-a", "wechat:reply_script");
    const accountBFull = cacheKey("account-b", "wechat:full_answer");
    const accountADeepSeekStrict = cacheKey("account-a", "wechat:full_answer:tail_strict");
    const accountADoubaoGlobal = cacheKey("account-a", "wechat:full_answer:global");

    assert.equal(accountAFull, accountAFullAgain);
    assert.notEqual(accountAFull, accountAReply);
    assert.notEqual(accountAFull, accountBFull);
    assert.notEqual(accountADeepSeekStrict, accountADoubaoGlobal);

    const original = {
      parseStatus: "parsed",
      extractedText: "完整原文",
      pageSummaries: ["第一页"]
    };

    writeAdminIngestOcrCache(accountAFull, original, 100);
    original.pageSummaries.push("调用方后续修改");
    const firstRead = readAdminIngestOcrCache<typeof original>(accountAFull, 500);

    assert.deepEqual(firstRead, {
      parseStatus: "parsed",
      extractedText: "完整原文",
      pageSummaries: ["第一页"]
    });
    firstRead?.pageSummaries.push("读取方修改");
    assert.deepEqual(
      readAdminIngestOcrCache<typeof original>(accountAFull, 600)?.pageSummaries,
      ["第一页"]
    );
    assert.equal(readAdminIngestOcrCache(accountAFull, 1_100), null);

    const keyA = cacheKey("account-a", "generic", "a");
    const keyB = cacheKey("account-a", "generic", "b");
    const keyC = cacheKey("account-a", "generic", "c");

    writeAdminIngestOcrCache(keyA, { value: "a" }, 2_000);
    writeAdminIngestOcrCache(keyB, { value: "b" }, 2_000);
    assert.deepEqual(readAdminIngestOcrCache(keyA, 2_100), { value: "a" });
    writeAdminIngestOcrCache(keyC, { value: "c" }, 2_100);

    assert.equal(readAdminIngestOcrCache(keyB, 2_100), null);
    assert.deepEqual(readAdminIngestOcrCache(keyA, 2_100), { value: "a" });
    assert.deepEqual(readAdminIngestOcrCache(keyC, 2_100), { value: "c" });

    console.log("Admin ingest OCR cache tests passed.");
  } finally {
    clearAdminIngestOcrCache();
    restoreEnvironment();
  }
}

main();
