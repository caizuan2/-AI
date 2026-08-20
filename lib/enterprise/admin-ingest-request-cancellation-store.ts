import "server-only";

type ActiveAdminIngestRequest = {
  controller: AbortController;
  registeredAt: number;
};

const CANCELLATION_TTL_MS = 10 * 60 * 1000;
const activeRequestByKey = new Map<string, ActiveAdminIngestRequest>();
const cancelledRequestExpiryByKey = new Map<string, number>();

function createRequestKey(
  ownerUserId: string,
  conversationId: string,
  requestId: string
) {
  return `${ownerUserId}\u0000${conversationId}\u0000${requestId}`;
}

function pruneExpiredCancellations(now = Date.now()) {
  cancelledRequestExpiryByKey.forEach((expiresAt, key) => {
    if (expiresAt <= now) {
      cancelledRequestExpiryByKey.delete(key);
    }
  });
}

export function registerAdminIngestActiveRequest(input: {
  ownerUserId: string;
  conversationId: string;
  requestId: string;
  clientSignal?: AbortSignal;
}) {
  pruneExpiredCancellations();
  const key = createRequestKey(
    input.ownerUserId,
    input.conversationId,
    input.requestId
  );
  const controller = new AbortController();
  const abortFromClient = () => {
    if (!controller.signal.aborted) {
      controller.abort(input.clientSignal?.reason);
    }
  };

  if (input.clientSignal?.aborted) {
    abortFromClient();
  } else {
    input.clientSignal?.addEventListener("abort", abortFromClient, { once: true });
  }

  if ((cancelledRequestExpiryByKey.get(key) ?? 0) > Date.now()) {
    controller.abort(new DOMException("该投喂请求已被停止。", "AbortError"));
  }

  activeRequestByKey.set(key, {
    controller,
    registeredAt: Date.now()
  });

  return {
    signal: controller.signal,
    unregister() {
      input.clientSignal?.removeEventListener("abort", abortFromClient);
      const active = activeRequestByKey.get(key);

      if (active?.controller === controller) {
        activeRequestByKey.delete(key);
      }
    }
  };
}

export function cancelAdminIngestActiveRequest(input: {
  ownerUserId: string;
  conversationId: string;
  requestId: string;
}) {
  pruneExpiredCancellations();
  const key = createRequestKey(
    input.ownerUserId,
    input.conversationId,
    input.requestId
  );
  cancelledRequestExpiryByKey.set(key, Date.now() + CANCELLATION_TTL_MS);
  const active = activeRequestByKey.get(key);

  if (!active || active.controller.signal.aborted) {
    return false;
  }

  active.controller.abort(new DOMException("该投喂请求已被其他设备停止。", "AbortError"));
  return true;
}

export function isAdminIngestRequestCancellationPending(input: {
  ownerUserId: string;
  conversationId: string;
  requestId: string;
}) {
  pruneExpiredCancellations();
  return (cancelledRequestExpiryByKey.get(
    createRequestKey(input.ownerUserId, input.conversationId, input.requestId)
  ) ?? 0) > Date.now();
}
