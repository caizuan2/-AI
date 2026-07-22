import "server-only";

import { copyFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import chiSimLanguage from "@tesseract.js-data/chi_sim";
import engLanguage from "@tesseract.js-data/eng";
import sharp from "sharp";
import Tesseract from "tesseract.js";

export type AdminIngestLocalOcrStatus =
  | "ok"
  | "unavailable"
  | "unsupported"
  | "skipped_large"
  | "failed";

export type AdminIngestLocalOcrCode =
  | "LOCAL_OCR_OK"
  | "LOCAL_OCR_DISABLED"
  | "LOCAL_OCR_UNSUPPORTED_MEDIA"
  | "LOCAL_OCR_IMAGE_TOO_LARGE"
  | "LOCAL_OCR_EMPTY"
  | "LOCAL_OCR_CANCELLED"
  | "LOCAL_OCR_TIMEOUT"
  | "LOCAL_OCR_FAILED";

export interface AdminIngestLocalOcrResult {
  status: AdminIngestLocalOcrStatus;
  code: AdminIngestLocalOcrCode;
  text: string;
  provider: "local-ocr";
  model: "tesseract.js/chi_sim+eng";
  confidence?: number;
  lowConfidence?: boolean;
  attempts?: 0 | 1 | 2;
  truncated?: boolean;
}

interface TesseractLanguagePackage {
  code: string;
  gzip: boolean;
  langPath: string;
}

const DEFAULT_MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_DIMENSION = 3_200;
const DEFAULT_MAX_INPUT_PIXELS = 30_000_000;
const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 60;
const MAX_OCR_TEXT_CHARS = 20_000;
const LOCAL_OCR_MODEL = "tesseract.js/chi_sim+eng" as const;
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp"
]);

let workerPromise: Promise<Tesseract.Worker> | null = null;
let ocrQueue: Promise<void> = Promise.resolve();

type LocalOcrAttempt = 1 | 2;
type LocalOcrPreprocessMode = "standard" | "high-contrast";

interface LocalOcrBudget {
  deadlineAt: number;
  signal?: AbortSignal;
}

interface LocalOcrCandidate {
  text: string;
  confidence: number;
  attempt: LocalOcrAttempt;
}

class LocalOcrControlError extends Error {
  readonly code: "LOCAL_OCR_ABORTED" | "LOCAL_OCR_TIMEOUT";

  constructor(code: "LOCAL_OCR_ABORTED" | "LOCAL_OCR_TIMEOUT") {
    super(code);
    this.name = "LocalOcrControlError";
    this.code = code;
  }
}

function readBoundedNumberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}

function isLocalOcrEnabled() {
  return process.env.ADMIN_INGEST_LOCAL_OCR_ENABLED?.trim().toLowerCase() !== "false";
}

function cleanOcrText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function localOcrResult(input: Omit<AdminIngestLocalOcrResult, "provider" | "model">): AdminIngestLocalOcrResult {
  return {
    ...input,
    provider: "local-ocr",
    model: LOCAL_OCR_MODEL
  };
}

function createLocalOcrBudget(signal?: AbortSignal): LocalOcrBudget {
  const timeoutMs = readBoundedNumberEnv(
    "ADMIN_INGEST_LOCAL_OCR_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS,
    1,
    120_000
  );

  return {
    deadlineAt: Date.now() + timeoutMs,
    signal
  };
}

function throwIfLocalOcrInterrupted(budget: LocalOcrBudget) {
  if (budget.signal?.aborted) {
    throw new LocalOcrControlError("LOCAL_OCR_ABORTED");
  }

  if (Date.now() >= budget.deadlineAt) {
    throw new LocalOcrControlError("LOCAL_OCR_TIMEOUT");
  }
}

async function runWithinLocalOcrBudget<T>(
  budget: LocalOcrBudget,
  operation: () => Promise<T>,
  onInterrupted?: () => void
) {
  try {
    throwIfLocalOcrInterrupted(budget);
  } catch (error) {
    if (error instanceof LocalOcrControlError) {
      onInterrupted?.();
    }

    throw error;
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let abortHandler: (() => void) | null = null;

  try {
    const interruption = new Promise<never>((_, reject) => {
      const remainingMs = Math.max(1, budget.deadlineAt - Date.now());
      timeoutId = setTimeout(
        () => reject(new LocalOcrControlError("LOCAL_OCR_TIMEOUT")),
        remainingMs
      );

      if (budget.signal) {
        abortHandler = () => reject(new LocalOcrControlError("LOCAL_OCR_ABORTED"));
        budget.signal.addEventListener("abort", abortHandler, { once: true });
      }
    });

    return await Promise.race([operation(), interruption]);
  } catch (error) {
    if (error instanceof LocalOcrControlError) {
      onInterrupted?.();
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (abortHandler && budget.signal) {
      budget.signal.removeEventListener("abort", abortHandler);
    }
  }
}

async function prepareOfflineLanguagePath() {
  const chiSim = chiSimLanguage as TesseractLanguagePackage;
  const eng = engLanguage as TesseractLanguagePackage;
  const root = process.env.ADMIN_INGEST_LOCAL_OCR_CACHE_DIR?.trim()
    || path.join(tmpdir(), "xt-admin-ingest-ocr");
  const langPath = path.join(root, "lang");
  const cachePath = path.join(root, "cache");

  await Promise.all([
    mkdir(langPath, { recursive: true }),
    mkdir(cachePath, { recursive: true })
  ]);
  await Promise.all([chiSim, eng].map(async (language) => {
    const fileName = `${language.code}.traineddata${language.gzip ? ".gz" : ""}`;
    await copyFile(path.join(language.langPath, fileName), path.join(langPath, fileName));
  }));

  return {
    root,
    langPath,
    cachePath,
    gzip: chiSim.gzip && eng.gzip
  };
}

async function createLocalOcrWorker() {
  const language = await prepareOfflineLanguagePath();
  const worker = await Tesseract.createWorker(["chi_sim", "eng"], Tesseract.OEM.LSTM_ONLY, {
    langPath: language.langPath,
    cachePath: language.cachePath,
    gzip: language.gzip,
    logger: () => undefined,
    errorHandler: () => undefined
  });

  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: Tesseract.PSM.AUTO,
    user_defined_dpi: "300"
  });

  return worker;
}

function getLocalOcrWorker() {
  if (!workerPromise) {
    const pendingWorker = createLocalOcrWorker().catch((error) => {
      if (workerPromise === pendingWorker) {
        workerPromise = null;
      }
      throw error;
    });
    workerPromise = pendingWorker;
  }

  return workerPromise;
}

function invalidateLocalOcrWorker(
  expectedPromise: Promise<Tesseract.Worker>,
  worker?: Tesseract.Worker
) {
  if (workerPromise === expectedPromise) {
    workerPromise = null;
  }

  if (worker) {
    void worker.terminate().catch(() => undefined);
    return;
  }

  void expectedPromise
    .then((resolvedWorker) => resolvedWorker.terminate())
    .catch(() => undefined);
}

async function resetLocalOcrWorker(worker?: Tesseract.Worker) {
  workerPromise = null;

  if (worker) {
    await worker.terminate().catch(() => undefined);
  }
}

function enqueueLocalOcr<T>(task: () => Promise<T>) {
  const result = ocrQueue.then(task, task);
  ocrQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function preprocessImage(bytes: Uint8Array, mode: LocalOcrPreprocessMode) {
  const maxDimension = readBoundedNumberEnv(
    "ADMIN_INGEST_LOCAL_OCR_MAX_DIMENSION",
    DEFAULT_MAX_DIMENSION,
    800,
    6_000
  );
  const maxInputPixels = readBoundedNumberEnv(
    "ADMIN_INGEST_LOCAL_OCR_MAX_INPUT_PIXELS",
    DEFAULT_MAX_INPUT_PIXELS,
    4_000_000,
    60_000_000
  );
  const image = sharp(Buffer.from(bytes), { limitInputPixels: maxInputPixels }).rotate();
  const metadata = await image.metadata();
  const width = metadata.width ?? maxDimension;
  const height = metadata.height ?? maxDimension;
  const resize = width > maxDimension || height > maxDimension
    ? { width: maxDimension, height: maxDimension, fit: "inside" as const, withoutEnlargement: true }
    : undefined;

  let pipeline = image
    .resize(resize)
    .flatten({ background: "#ffffff" })
    .grayscale()
    .normalize();

  pipeline = mode === "high-contrast"
    ? pipeline.median(3).threshold(175).sharpen({ sigma: 1 })
    : pipeline.sharpen();

  return pipeline.png().toBuffer();
}

async function recognizeImage(input: {
  bytes: Uint8Array;
  budget: LocalOcrBudget;
  pageSegmentationMode: Tesseract.PSM;
}) {
  throwIfLocalOcrInterrupted(input.budget);
  const pendingWorker = getLocalOcrWorker();
  const worker = await runWithinLocalOcrBudget(
    input.budget,
    () => pendingWorker,
    () => invalidateLocalOcrWorker(pendingWorker)
  );
  await runWithinLocalOcrBudget(
    input.budget,
    () => worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: input.pageSegmentationMode,
        user_defined_dpi: "300"
      }),
    () => invalidateLocalOcrWorker(pendingWorker, worker)
  );
  const result = await runWithinLocalOcrBudget(
    input.budget,
    () => worker.recognize(Buffer.from(input.bytes), { rotateAuto: true }),
    () => invalidateLocalOcrWorker(pendingWorker, worker)
  );

  return result.data;
}

function normalizeOcrConfidence(value: unknown) {
  const confidence = typeof value === "number" && Number.isFinite(value) ? value : 0;

  return Math.min(100, Math.max(0, confidence));
}

function isLowConfidence(candidate: LocalOcrCandidate, threshold: number) {
  return !candidate.text || candidate.confidence <= threshold;
}

function selectMoreReliableCandidate(first: LocalOcrCandidate, second: LocalOcrCandidate) {
  if (Boolean(first.text) !== Boolean(second.text)) {
    return second.text ? second : first;
  }

  const confidenceDelta = second.confidence - first.confidence;

  if (Math.abs(confidenceDelta) > 2) {
    return confidenceDelta > 0 ? second : first;
  }

  const firstEvidenceLength = first.text.replace(/\s/g, "").length;
  const secondEvidenceLength = second.text.replace(/\s/g, "").length;

  if (firstEvidenceLength !== secondEvidenceLength) {
    return secondEvidenceLength > firstEvidenceLength ? second : first;
  }

  return confidenceDelta > 0 ? second : first;
}

async function runLocalOcrAttempt(input: {
  bytes: Uint8Array;
  budget: LocalOcrBudget;
  attempt: LocalOcrAttempt;
}) {
  const retry = input.attempt === 2;
  const processed = await runWithinLocalOcrBudget(
    input.budget,
    () => preprocessImage(input.bytes, retry ? "high-contrast" : "standard")
  );
  const data = await recognizeImage({
    bytes: processed,
    budget: input.budget,
    pageSegmentationMode: retry ? Tesseract.PSM.SPARSE_TEXT : Tesseract.PSM.AUTO
  });

  return {
    text: cleanOcrText(data.text || ""),
    confidence: normalizeOcrConfidence(data.confidence),
    attempt: input.attempt
  } satisfies LocalOcrCandidate;
}

export async function terminateAdminIngestLocalOcrWorker() {
  const worker = workerPromise ? await workerPromise.catch(() => null) : null;

  await resetLocalOcrWorker(worker ?? undefined);
}

export async function extractAdminIngestLocalOcrText(input: {
  bytes: Uint8Array;
  mimeType: string;
  signal?: AbortSignal;
}): Promise<AdminIngestLocalOcrResult> {
  if (!isLocalOcrEnabled()) {
    return localOcrResult({
      status: "unavailable",
      code: "LOCAL_OCR_DISABLED",
      text: "",
      attempts: 0
    });
  }

  const mimeType = input.mimeType.trim().toLowerCase();

  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    return localOcrResult({
      status: "unsupported",
      code: "LOCAL_OCR_UNSUPPORTED_MEDIA",
      text: "",
      attempts: 0
    });
  }

  const maxBytes = readBoundedNumberEnv(
    "ADMIN_INGEST_LOCAL_OCR_MAX_BYTES",
    DEFAULT_MAX_IMAGE_BYTES,
    512 * 1024,
    20 * 1024 * 1024
  );

  if (input.bytes.byteLength > maxBytes) {
    return localOcrResult({
      status: "skipped_large",
      code: "LOCAL_OCR_IMAGE_TOO_LARGE",
      text: "",
      attempts: 0
    });
  }

  const budget = createLocalOcrBudget(input.signal);
  let attemptedCount: 0 | 1 | 2 = 0;

  try {
    throwIfLocalOcrInterrupted(budget);
    const lowConfidenceThreshold = readBoundedNumberEnv(
      "ADMIN_INGEST_LOCAL_OCR_LOW_CONFIDENCE_THRESHOLD",
      DEFAULT_LOW_CONFIDENCE_THRESHOLD,
      1,
      100
    );
    const queuedResult = enqueueLocalOcr(async () => {
      attemptedCount = 1;
      const first = await runLocalOcrAttempt({
        bytes: input.bytes,
        budget,
        attempt: 1
      });

      if (!isLowConfidence(first, lowConfidenceThreshold)) {
        return {
          selected: first,
          attempts: 1 as const
        };
      }

      attemptedCount = 2;
      const second = await runLocalOcrAttempt({
        bytes: input.bytes,
        budget,
        attempt: 2
      });

      return {
        selected: selectMoreReliableCandidate(first, second),
        attempts: 2 as const
      };
    });
    const { selected, attempts } = await runWithinLocalOcrBudget(
      budget,
      () => queuedResult
    );
    const lowConfidence = isLowConfidence(selected, lowConfidenceThreshold);
    const fullText = selected.text;

    if (!fullText) {
      return localOcrResult({
        status: "failed",
        code: "LOCAL_OCR_EMPTY",
        text: "",
        confidence: selected.confidence,
        lowConfidence: true,
        attempts
      });
    }

    return localOcrResult({
      status: "ok",
      code: "LOCAL_OCR_OK",
      text: fullText.slice(0, MAX_OCR_TEXT_CHARS),
      confidence: selected.confidence,
      lowConfidence,
      attempts,
      truncated: fullText.length > MAX_OCR_TEXT_CHARS
    });
  } catch (error) {
    const controlCode = error instanceof LocalOcrControlError ? error.code : null;

    return localOcrResult({
      status: "failed",
      code: controlCode === "LOCAL_OCR_ABORTED"
        ? "LOCAL_OCR_CANCELLED"
        : controlCode === "LOCAL_OCR_TIMEOUT"
          ? "LOCAL_OCR_TIMEOUT"
          : "LOCAL_OCR_FAILED",
      text: "",
      attempts: attemptedCount
    });
  }
}
