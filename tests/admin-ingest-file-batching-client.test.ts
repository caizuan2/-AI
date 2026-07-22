import assert from "node:assert/strict";

import {
  AdminIngestFileParseCancelledError,
  parseUploadedFileForGpt,
  type IngestUploadState
} from "../lib/enterprise/ingest-client";

type ParseBatchData = {
  fileName?: string;
  fileType?: string;
  mimeType?: string;
  sizeBytes?: number;
  parseStatus?: "parsed" | "partial" | "metadata_only" | "unsupported" | "ocr_pending";
  extractedText?: string;
  pageSummaries?: string[];
  slideTexts?: Array<{ slideIndex: number; text: string }>;
  totalPages?: number;
  processedPageStart?: number | null;
  processedPageEnd?: number | null;
  nextPage?: number | null;
  complete?: boolean;
  successfulPages?: number[];
  failedPages?: number[];
  lowConfidencePages?: number[];
  coveragePercent?: number;
  successRatePercent?: number;
  deadlineReached?: boolean;
  limitationNote?: string;
};

function createUpload(fileName = "60页扫描资料.pdf"): IngestUploadState {
  const rawFile = new File(["mock-pdf"], fileName, { type: "application/pdf" });

  return {
    id: `batching-${fileName}`,
    fileName,
    fileType: rawFile.type,
    fileSize: rawFile.size,
    rawFile,
    mimeType: rawFile.type,
    status: "pending_parse",
    source: "admin_ingest",
    platform: "web",
    syncTarget: ["web"],
    createdAt: new Date(0).toISOString()
  };
}

function successfulResponse(data: ParseBatchData) {
  return new Response(JSON.stringify({
    ok: true,
    data: {
      fileName: data.fileName ?? "60页扫描资料.pdf",
      fileType: data.fileType ?? "application/pdf",
      mimeType: data.mimeType ?? "application/pdf",
      sizeBytes: data.sizeBytes ?? 8,
      parseStatus: data.parseStatus ?? "partial",
      extractedText: data.extractedText ?? "",
      pageSummaries: data.pageSummaries ?? [],
      slideTexts: data.slideTexts ?? [],
      totalPages: data.totalPages ?? 8,
      processedPageStart: data.processedPageStart ?? null,
      processedPageEnd: data.processedPageEnd ?? null,
      nextPage: data.nextPage ?? null,
      complete: data.complete ?? false,
      successfulPages: data.successfulPages ?? [],
      failedPages: data.failedPages ?? [],
      lowConfidencePages: data.lowConfidencePages ?? [],
      coveragePercent: data.coveragePercent ?? 0,
      successRatePercent: data.successRatePercent ?? 0,
      deadlineReached: data.deadlineReached ?? false,
      limitationNote: data.limitationNote ?? ""
    }
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function readPageStart(init?: RequestInit) {
  assert.ok(init?.body instanceof FormData, "解析请求必须使用 FormData");
  return Number(init.body.get("pageStart"));
}

function readPageBatchSize(init?: RequestInit) {
  assert.ok(init?.body instanceof FormData, "解析请求必须使用 FormData");
  return Number(init.body.get("pageBatchSize"));
}

async function testContinuesFromPageOneToFiveAndMergesCoverage() {
  const originalFetch = globalThis.fetch;
  const requestedPageStarts: number[] = [];
  const progressSnapshots: Array<{
    processedPageEnd: number | null;
    successfulPages: number[];
    failedPages: number[];
    lowConfidencePages: number[];
    coveragePercent: number;
    complete: boolean;
  }> = [];

  globalThis.fetch = async (_input, init) => {
    const pageStart = readPageStart(init);
    requestedPageStarts.push(pageStart);

    if (pageStart === 1) {
      return successfulResponse({
        extractedText: "第1页正文\n第2页正文\n第3页低置信正文",
        pageSummaries: ["第1页：正文", "第2页：正文", "第3页：低置信正文"],
        totalPages: 8,
        processedPageStart: 1,
        processedPageEnd: 4,
        nextPage: 5,
        complete: false,
        successfulPages: [1, 2, 3],
        failedPages: [4],
        lowConfidencePages: [3],
        coveragePercent: 50,
        successRatePercent: 75,
        limitationNote: "第4页识别失败。"
      });
    }

    if (pageStart === 4) {
      assert.equal(readPageBatchSize(init), 1, "失败页必须只重试当前单页");
      return successfulResponse({
        extractedText: "第4页重试正文",
        pageSummaries: ["第4页：重试正文"],
        totalPages: 8,
        processedPageStart: 4,
        processedPageEnd: 4,
        nextPage: 5,
        complete: false,
        successfulPages: [4],
        failedPages: [],
        coveragePercent: 50,
        successRatePercent: 100
      });
    }

    assert.equal(pageStart, 5);
    return successfulResponse({
      extractedText: "第5页正文\n第6页正文\n第7页低置信正文\n第8页正文",
      pageSummaries: ["第5页：正文", "第6页：正文", "第7页：低置信正文", "第8页：正文"],
      totalPages: 8,
      processedPageStart: 5,
      processedPageEnd: 8,
      nextPage: null,
      complete: true,
      successfulPages: [5, 6, 7, 8],
      failedPages: [],
      lowConfidencePages: [7],
      coveragePercent: 100,
      successRatePercent: 100
    });
  };

  try {
    const result = await parseUploadedFileForGpt(createUpload(), undefined, {
      pageBatchSize: 4,
      onProgress: (progress) => {
        progressSnapshots.push({
          processedPageEnd: progress.processedPageEnd,
          successfulPages: [...progress.successfulPages],
          failedPages: [...progress.failedPages],
          lowConfidencePages: [...progress.lowConfidencePages],
          coveragePercent: progress.coveragePercent,
          complete: progress.complete
        });
      }
    });

    assert.deepEqual(requestedPageStarts, [1, 5, 4]);
    assert.match(result.extractedText ?? "", /第1页正文/);
    assert.match(result.extractedText ?? "", /第8页正文/);
    assert.deepEqual(result.successfulPages, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(result.failedPages, []);
    assert.deepEqual(result.lowConfidencePages, [3, 7]);
    assert.equal(result.pageSummaries?.length, 8);
    assert.equal(result.processedPageStart, 1);
    assert.equal(result.processedPageEnd, 8);
    assert.equal(result.nextPage, null);
    assert.equal(result.complete, true);
    assert.equal(result.coveragePercent, 100);
    assert.equal(result.parseStatus, "partial", "存在失败页或低置信页时不能伪报完整解析");

    assert.equal(progressSnapshots.length, 3);
    assert.deepEqual(progressSnapshots[0], {
      processedPageEnd: 4,
      successfulPages: [1, 2, 3],
      failedPages: [4],
      lowConfidencePages: [3],
      coveragePercent: 50,
      complete: false
    });
    assert.deepEqual(progressSnapshots[1], {
      processedPageEnd: 8,
      successfulPages: [1, 2, 3, 5, 6, 7, 8],
      failedPages: [4],
      lowConfidencePages: [3, 7],
      coveragePercent: 100,
      complete: true
    });
    assert.deepEqual(progressSnapshots[2], {
      processedPageEnd: 8,
      successfulPages: [1, 2, 3, 4, 5, 6, 7, 8],
      failedPages: [],
      lowConfidencePages: [3, 7],
      coveragePercent: 100,
      complete: true
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testStopsWhenServerReturnsNonAdvancingNextPage() {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = async (_input, init) => {
    requestCount += 1;
    assert.equal(readPageStart(init), 1);
    return successfulResponse({
      extractedText: "第1页已识别正文",
      pageSummaries: ["第1页：已识别正文"],
      totalPages: 8,
      processedPageStart: 1,
      processedPageEnd: 1,
      nextPage: 1,
      complete: false,
      successfulPages: [1],
      coveragePercent: 12.5,
      successRatePercent: 100
    });
  };

  try {
    const result = await parseUploadedFileForGpt(createUpload("游标停滞.pdf"));

    assert.equal(requestCount, 1, "nextPage 未前进时必须立即停止，不能形成无限请求");
    assert.equal(result.parseStatus, "partial");
    assert.equal(result.complete, false);
    assert.equal(result.nextPage, 1);
    assert.match(result.extractedText ?? "", /第1页已识别正文/);
    assert.match(result.limitationNote ?? "", /没有取得可续传进度/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testForwardsAndHonorsExternalAbortSignal() {
  const originalFetch = globalThis.fetch;
  const externalController = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  let releaseSecondRequest: (() => void) | null = null;
  const secondRequestStarted = new Promise<void>((resolve) => {
    releaseSecondRequest = resolve;
  });

  globalThis.fetch = async (_input, init) => {
    receivedSignal = init?.signal instanceof AbortSignal ? init.signal : undefined;
    assert.ok(receivedSignal, "fetch 必须收到可取消的组合信号");

    if (readPageStart(init) === 1) {
      return successfulResponse({
        extractedText: "第1至4页已识别",
        pageSummaries: ["第1页", "第2页", "第3页", "第4页"],
        totalPages: 8,
        processedPageStart: 1,
        processedPageEnd: 4,
        nextPage: 5,
        complete: false,
        successfulPages: [1, 2, 3, 4],
        coveragePercent: 50,
        successRatePercent: 100
      });
    }

    releaseSecondRequest?.();

    return await new Promise<Response>((_resolve, reject) => {
      const rejectAsAborted = () => reject(
        receivedSignal?.reason instanceof Error
          ? receivedSignal.reason
          : new DOMException("附件解析已取消。", "AbortError")
      );

      if (receivedSignal?.aborted) {
        rejectAsAborted();
      } else {
        receivedSignal?.addEventListener("abort", rejectAsAborted, { once: true });
      }
    });
  };

  try {
    const parsePromise = parseUploadedFileForGpt(createUpload("主动取消.pdf"), undefined, {
      signal: externalController.signal,
      requestTimeoutMs: 10_000
    });

    await secondRequestStarted;
    externalController.abort(new Error("用户主动取消附件解析"));

    const cancelled = await parsePromise.catch((error) => error);

    assert.ok(cancelled instanceof AdminIngestFileParseCancelledError);
    assert.equal(receivedSignal?.aborted, true);
    assert.equal(cancelled.files[0].nextPage, 5);
    assert.equal(cancelled.files[0].complete, false);
    assert.deepEqual(cancelled.files[0].successfulPages, [1, 2, 3, 4]);
    assert.match(cancelled.files[0].extractedText ?? "", /第1至4页已识别/);
    assert.match(cancelled.files[0].limitationNote ?? "", /续传位置已保留/);

    const resumedPageStarts: number[] = [];
    globalThis.fetch = async (_input, init) => {
      resumedPageStarts.push(readPageStart(init));
      return successfulResponse({
        extractedText: "第5至8页续传正文",
        pageSummaries: ["第5页", "第6页", "第7页", "第8页"],
        totalPages: 8,
        processedPageStart: 5,
        processedPageEnd: 8,
        nextPage: null,
        complete: true,
        successfulPages: [5, 6, 7, 8],
        coveragePercent: 100,
        successRatePercent: 100,
        parseStatus: "parsed"
      });
    };

    const resumed = await parseUploadedFileForGpt(cancelled.files[0]);

    assert.deepEqual(resumedPageStarts, [5], "取消后重试必须从保存的 nextPage 继续");
    assert.deepEqual(resumed.successfulPages, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.match(resumed.extractedText ?? "", /第1至4页已识别/);
    assert.match(resumed.extractedText ?? "", /第5至8页续传正文/);
    assert.equal(resumed.complete, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testPreservesFirstBatchWhenFollowingHttpRequestFails() {
  const originalFetch = globalThis.fetch;
  const requestedPageStarts: number[] = [];

  globalThis.fetch = async (_input, init) => {
    const pageStart = readPageStart(init);
    requestedPageStarts.push(pageStart);

    if (pageStart === 1) {
      return successfulResponse({
        extractedText: "第1至4页已经成功提取",
        pageSummaries: ["第1页", "第2页", "第3页", "第4页"],
        totalPages: 12,
        processedPageStart: 1,
        processedPageEnd: 4,
        nextPage: 5,
        complete: false,
        successfulPages: [1, 2, 3, 4],
        coveragePercent: 33.33,
        successRatePercent: 100
      });
    }

    return new Response(JSON.stringify({
      ok: false,
      message: "第5页起的解析服务暂时失败"
    }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const result = await parseUploadedFileForGpt(createUpload("中途失败.pdf"));

    assert.deepEqual(requestedPageStarts, [1, 5]);
    assert.equal(result.status, "parsed", "已有证据时后续失败不能把整份附件标记为 failed");
    assert.equal(result.parseStatus, "partial");
    assert.equal(result.complete, false);
    assert.equal(result.nextPage, 5);
    assert.equal(result.processedPageStart, 1);
    assert.equal(result.processedPageEnd, 4);
    assert.deepEqual(result.successfulPages, [1, 2, 3, 4]);
    assert.match(result.extractedText ?? "", /第1至4页已经成功提取/);
    assert.match(result.limitationNote ?? "", /第5页起的解析服务暂时失败/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  await testContinuesFromPageOneToFiveAndMergesCoverage();
  await testStopsWhenServerReturnsNonAdvancingNextPage();
  await testForwardsAndHonorsExternalAbortSignal();
  await testPreservesFirstBatchWhenFollowingHttpRequestFails();

  console.log("admin ingest client file batching tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
