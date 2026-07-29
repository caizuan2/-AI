import "server-only";

type DoubaoProgressPhase = "pending" | "reasoning" | "visible" | "completed" | "failed" | "cancelled";

export type AdminIngestDoubaoProgressSnapshot = {
  requestId: string;
  actorId: string;
  historyScope: string;
  phase: DoubaoProgressPhase;
  replyMarkdown: string;
  actualModel?: string;
  responseId?: string;
  updatedAt: number;
};

type ProgressUpdate = Pick<
  AdminIngestDoubaoProgressSnapshot,
  "phase" | "replyMarkdown" | "actualModel" | "responseId"
>;

const PROGRESS_TTL_MS = 5 * 60_000;
const progressByRequestId = new Map<string, AdminIngestDoubaoProgressSnapshot>();

function cleanupExpiredProgress(now = Date.now()) {
  for (const [requestId, snapshot] of Array.from(progressByRequestId.entries())) {
    if (now - snapshot.updatedAt > PROGRESS_TTL_MS) {
      progressByRequestId.delete(requestId);
    }
  }
}

export function beginAdminIngestDoubaoProgress(input: {
  requestId: string;
  actorId: string;
  historyScope: string;
}) {
  cleanupExpiredProgress();
  progressByRequestId.set(input.requestId, {
    ...input,
    phase: "pending",
    replyMarkdown: "",
    updatedAt: Date.now()
  });
}

export function updateAdminIngestDoubaoProgress(
  requestId: string,
  update: Partial<ProgressUpdate>
) {
  const current = progressByRequestId.get(requestId);

  if (!current) {
    return;
  }

  progressByRequestId.set(requestId, {
    ...current,
    ...update,
    replyMarkdown: update.replyMarkdown ?? current.replyMarkdown,
    updatedAt: Date.now()
  });
}

export function readAdminIngestDoubaoProgress(input: {
  requestId: string;
  actorId: string;
  historyScope: string;
}) {
  cleanupExpiredProgress();
  const snapshot = progressByRequestId.get(input.requestId);

  if (!snapshot) {
    return null;
  }

  if (snapshot.actorId !== input.actorId || snapshot.historyScope !== input.historyScope) {
    return null;
  }

  return {
    phase: snapshot.phase,
    replyMarkdown: snapshot.replyMarkdown,
    actualModel: snapshot.actualModel,
    responseId: snapshot.responseId,
    updatedAt: snapshot.updatedAt
  };
}
