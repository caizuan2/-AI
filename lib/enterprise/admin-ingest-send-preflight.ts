interface AdminIngestSendPreflightScope {
  historyScope: string;
  agentId: string;
  conversationId: string;
}

export interface AdminIngestSendPreflightAttempt {
  readonly key: string;
  readonly token: symbol;
}

/** A synchronous, per-draft reservation only for the asynchronous send preflight. */
export function createAdminIngestSendPreflightGuard() {
  const pending = new Map<string, symbol>();
  let active = true;

  return {
    acquire(scope: AdminIngestSendPreflightScope): AdminIngestSendPreflightAttempt | null {
      const key = JSON.stringify([scope.historyScope, scope.agentId, scope.conversationId]);
      if (!active || pending.has(key)) return null;
      const token = Symbol("admin-ingest-send-preflight");
      pending.set(key, token);
      return { key, token };
    },
    isCurrent(attempt: AdminIngestSendPreflightAttempt) {
      return active && pending.get(attempt.key) === attempt.token;
    },
    release(attempt: AdminIngestSendPreflightAttempt) {
      if (pending.get(attempt.key) === attempt.token) pending.delete(attempt.key);
    },
    invalidate() {
      pending.clear();
    },
    activate() {
      active = true;
    },
    dispose() {
      active = false;
      pending.clear();
    }
  };
}
