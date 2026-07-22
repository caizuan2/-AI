import assert from "node:assert/strict";

import sharp from "sharp";

import {
  extractAdminIngestLocalOcrText,
  terminateAdminIngestLocalOcrWorker
} from "../lib/enterprise/ingest-local-ocr";

const TEST_ENV_NAMES = [
  "ADMIN_INGEST_LOCAL_OCR_ENABLED",
  "ADMIN_INGEST_LOCAL_OCR_TIMEOUT_MS",
  "ADMIN_INGEST_LOCAL_OCR_LOW_CONFIDENCE_THRESHOLD"
] as const;

const originalFetch = globalThis.fetch;
const originalEnv = Object.fromEntries(
  TEST_ENV_NAMES.map((name) => [name, process.env[name]])
) as Record<(typeof TEST_ENV_NAMES)[number], string | undefined>;

function restoreEnvironment() {
  for (const name of TEST_ENV_NAMES) {
    const value = originalEnv[name];

    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

async function buildTextImage(text: string) {
  const svg = Buffer.from([
    "<svg width=\"1400\" height=\"360\" xmlns=\"http://www.w3.org/2000/svg\">",
    "<rect width=\"100%\" height=\"100%\" fill=\"white\"/>",
    `<text x=\"65\" y=\"215\" font-family=\"Arial\" font-size=\"84\" font-weight=\"700\" fill=\"black\">${text}</text>`,
    "</svg>"
  ].join(""));

  return sharp(svg).png().toBuffer();
}

async function main() {
  let networkCallCount = 0;

  try {
    process.env.ADMIN_INGEST_LOCAL_OCR_ENABLED = "true";
    process.env.ADMIN_INGEST_LOCAL_OCR_TIMEOUT_MS = "120000";
    process.env.ADMIN_INGEST_LOCAL_OCR_LOW_CONFIDENCE_THRESHOLD = "100";
    globalThis.fetch = (async () => {
      networkCallCount += 1;
      throw new Error("Local OCR resilience must never call a cloud model.");
    }) as typeof fetch;

    const textImage = await buildTextImage("RETRY SAFE 2026");
    const retried = await extractAdminIngestLocalOcrText({
      bytes: textImage,
      mimeType: "image/png"
    });

    assert.equal(retried.status, "ok");
    assert.equal(retried.code, "LOCAL_OCR_OK");
    assert.match(retried.text, /RETRY\s+SAFE\s+2026/i);
    assert.equal(retried.attempts, 2);
    assert.equal(retried.lowConfidence, true);
    assert.equal(typeof retried.confidence, "number");
    assert.ok((retried.confidence ?? -1) >= 0 && (retried.confidence ?? 101) <= 100);
    assert.equal(retried.provider, "local-ocr");
    assert.equal(retried.model, "tesseract.js/chi_sim+eng");

    const blankImage = await sharp({
      create: {
        width: 900,
        height: 500,
        channels: 3,
        background: "white"
      }
    }).png().toBuffer();
    const empty = await extractAdminIngestLocalOcrText({
      bytes: blankImage,
      mimeType: "image/png"
    });

    assert.equal(empty.status, "failed");
    assert.equal(empty.code, "LOCAL_OCR_EMPTY");
    assert.equal(empty.text, "");
    assert.equal(empty.attempts, 2);
    assert.equal(empty.lowConfidence, true);
    assert.equal(typeof empty.confidence, "number");

    const abortController = new AbortController();
    const cancelStartedAt = Date.now();
    const cancelledPromise = extractAdminIngestLocalOcrText({
      bytes: textImage,
      mimeType: "image/png",
      signal: abortController.signal
    });
    setTimeout(() => abortController.abort(), 1);
    const cancelled = await cancelledPromise;

    assert.equal(cancelled.status, "failed");
    assert.equal(cancelled.code, "LOCAL_OCR_CANCELLED");
    assert.equal(cancelled.text, "");
    assert.ok(Date.now() - cancelStartedAt < 5_000);

    await terminateAdminIngestLocalOcrWorker();
    process.env.ADMIN_INGEST_LOCAL_OCR_TIMEOUT_MS = "1";
    const timeoutStartedAt = Date.now();
    const timedOut = await extractAdminIngestLocalOcrText({
      bytes: textImage,
      mimeType: "image/png"
    });

    assert.equal(timedOut.status, "failed");
    assert.equal(timedOut.code, "LOCAL_OCR_TIMEOUT");
    assert.equal(timedOut.text, "");
    assert.ok(Date.now() - timeoutStartedAt < 5_000);
    assert.equal(networkCallCount, 0);

    console.log("Admin ingest local OCR resilience tests passed.");
  } finally {
    await terminateAdminIngestLocalOcrWorker();
    restoreEnvironment();
    globalThis.fetch = originalFetch;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
