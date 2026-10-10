import type { AdminIngestLatencyTrace } from "./admin-ingest-latency-trace";
import type { IngestUploadState } from "./ingest-client";

interface PrepareAdminIngestAttachmentsInput {
  uploads: IngestUploadState[];
  controller: AbortController;
  trace: AdminIngestLatencyTrace;
  persist: (uploads: IngestUploadState[], signal: AbortSignal) => Promise<IngestUploadState[]>;
  parse?: (uploads: IngestUploadState[], signal: AbortSignal) => Promise<IngestUploadState[]>;
  isParseCancellation: (error: unknown) => boolean;
  maxWaitAfterPersistMs?: number;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function getAdminIngestRemainingVisibleBudgetMs(input: {
  provider: string;
  budgetMs: number;
  imagePersistCompletedAt: number | null;
  now?: number;
}) {
  if (
    (
      input.provider !== "doubao-pro"
      && input.provider !== "deepseek-pro"
      && input.provider !== "deepseek-flash"
    )
    || input.imagePersistCompletedAt === null
  ) {
    return input.budgetMs;
  }
  const preparationElapsedMs = Math.max(0, (input.now ?? Date.now()) - input.imagePersistCompletedAt);
  return Math.max(0, input.budgetMs - preparationElapsedMs);
}

/** Overlap only independent image persistence and parsing, retaining their individual timings. */
export async function prepareAdminIngestAttachments(input: PrepareAdminIngestAttachmentsInput) {
  const { controller, trace } = input;
  const cancellationError = () => isAbortError(controller.signal.reason)
    ? controller.signal.reason
    : new DOMException("Admin ingest attachment preparation cancelled.", "AbortError");
  const throwIfCancelled = (error?: unknown) => {
    if (controller.signal.aborted || input.isParseCancellation(error) || isAbortError(error)) {
      throw cancellationError();
    }
  };
  throwIfCancelled();

  const boundedParse = Boolean(input.parse) && Number.isFinite(input.maxWaitAfterPersistMs);
  const parseController = boundedParse ? new AbortController() : controller;
  let waitTimeout: ReturnType<typeof setTimeout> | undefined;
  let parseTimedOut = false;
  let preparationClosed = false;
  let persistenceFailed = false;
  let persistenceError: unknown;
  let onOuterAbort: (() => void) | undefined;
  const outerAbortPromise = boundedParse
    ? new Promise<never>((_resolve, reject) => {
      onOuterAbort = () => {
        parseController.abort(controller.signal.reason);
        reject(persistenceFailed ? persistenceError : cancellationError());
      };
      controller.signal.addEventListener("abort", onOuterAbort, { once: true });
    })
    : null;
  const imagePersistenceStartedAt = Date.now();
  let imagePersistCompletedAt = imagePersistenceStartedAt;
  const imagePersistencePromise = Promise.resolve().then(
    () => input.persist(input.uploads, controller.signal)
  ).then((files) => {
    imagePersistCompletedAt = Date.now();
    if (!preparationClosed && !controller.signal.aborted) {
      trace.mark("image_persist_completed", imagePersistenceStartedAt);
    }
    return files;
  }).catch((error: unknown) => {
    persistenceFailed = true;
    persistenceError = error;
    controller.abort(error);
    throw error;
  });
  const attachmentParseStartedAt = Date.now();
  const parse = input.parse;
  const overlappingAttachmentParsePromise = parse
    ? Promise.resolve().then(() => parse(input.uploads, parseController.signal)).then(
      (files) => {
        if (!preparationClosed && !parseController.signal.aborted) {
          trace.mark("attachment_parse_completed", attachmentParseStartedAt);
        }
        return { files, error: null };
      },
      (error: unknown) => ({ files: null, error })
    )
    : Promise.resolve({ files: null, error: null });

  try {
    // Both tasks are already running. Original-reply models supply a short
    // parse deadline anchored at persistence completion so the 60s body SLO remains.
    const persistedUploads = await (outerAbortPromise
      ? Promise.race([imagePersistencePromise, outerAbortPromise])
      : imagePersistencePromise);
    throwIfCancelled();
    const parseDeadlinePromise = boundedParse
      ? new Promise<{ files: null; error: null }>((resolve) => {
        const remainingMs = Math.max(0, (input.maxWaitAfterPersistMs ?? 0) - (Date.now() - imagePersistCompletedAt));
        waitTimeout = setTimeout(() => {
          parseTimedOut = true;
          parseController.abort(new DOMException("Admin ingest attachment preparation deadline reached.", "TimeoutError"));
          resolve({ files: null, error: null });
        }, remainingMs);
      })
      : null;
    const overlappingAttachmentParse = parseDeadlinePromise && outerAbortPromise
      ? await Promise.race([overlappingAttachmentParsePromise, parseDeadlinePromise, outerAbortPromise])
      : await overlappingAttachmentParsePromise;

    // A stop/account switch always wins over a concurrent deadline. A parser
    // ignoring cancellation cannot commit a late result or extend the UI wait.
    throwIfCancelled(parseTimedOut ? undefined : overlappingAttachmentParse.error);
    const persistedUploadById = new Map(persistedUploads.map((file) => [file.id, file] as const));
    const preparedUploads = parseTimedOut ? null : overlappingAttachmentParse.files?.map((file) => {
      const persistedFile = persistedUploadById.get(file.id);
      return persistedFile?.persistentUrl
        ? { ...file, previewUrl: persistedFile.previewUrl, persistentUrl: persistedFile.persistentUrl }
        : file;
    }) ?? null;

    // Ordinary parse rejection retains the existing sequential recovery path.
    // A deadline returns the anchor so ModeToggle commits its existing timeout
    // card synchronously, before either fallback parsing or model inference.
    return { persistedUploads, preparedUploads, imagePersistCompletedAt, parseDeadlineReached: parseTimedOut };
  } finally {
    preparationClosed = true;
    if (waitTimeout !== undefined) clearTimeout(waitTimeout);
    if (onOuterAbort) controller.signal.removeEventListener("abort", onOuterAbort);
  }
}
