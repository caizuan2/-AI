"use client";

export type AdminIngestHistoryLoadState = "loading" | "ready" | "error";
export type AdminIngestHistoryDisplayState =
  | "agents"
  | "loading"
  | "empty"
  | "error";

export function resolveAdminIngestHistoryDisplayState(input: {
  loadState: AdminIngestHistoryLoadState;
  agentCount: number;
}): AdminIngestHistoryDisplayState {
  if (input.agentCount > 0) {
    return "agents";
  }

  if (input.loadState === "loading") {
    return "loading";
  }

  if (input.loadState === "error") {
    return "error";
  }

  return "empty";
}
