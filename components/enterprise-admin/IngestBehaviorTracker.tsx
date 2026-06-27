"use client";

import { useEffect, useRef } from "react";
import type { KnowledgeBehaviorEventType } from "@/lib/enterprise/knowledge-behavior-types";

export interface IngestBehaviorPayload {
  eventType: KnowledgeBehaviorEventType;
  messageId?: string | null;
  conversationId?: string | null;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  chunkIds?: string[];
  evidenceIds?: string[];
  dwellMs?: number | null;
  source?: "admin_ingest" | "user_app";
  metadata?: Record<string, unknown>;
}

const sentEventKeys = new Map<string, number>();

function dedupeWindowMs(eventType: KnowledgeBehaviorEventType) {
  if (eventType === "regenerate_answer" || eventType === "agent_switch") {
    return 0;
  }

  if (eventType === "answer_dwell") {
    return 5 * 60_000;
  }

  return 30_000;
}

function shouldSend(payload: IngestBehaviorPayload) {
  const messageId = payload.messageId ?? "no-message";
  const key = `${payload.source ?? "admin_ingest"}:${messageId}:${payload.eventType}`;
  const windowMs = dedupeWindowMs(payload.eventType);

  if (windowMs <= 0) {
    return true;
  }

  const previousAt = sentEventKeys.get(key);
  const now = Date.now();

  if (previousAt && now - previousAt < windowMs) {
    return false;
  }

  sentEventKeys.set(key, now);
  return true;
}

export function trackIngestBehaviorEvent(payload: IngestBehaviorPayload) {
  if (typeof window === "undefined" || !payload.messageId) {
    return;
  }

  if (!shouldSend(payload)) {
    return;
  }

  void fetch("/api/feedback/behavior", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      source: payload.source ?? "admin_ingest"
    }),
    keepalive: true
  }).catch(() => undefined);
}

export interface IngestBehaviorTrackerProps extends Omit<IngestBehaviorPayload, "eventType" | "dwellMs"> {
  disabled?: boolean;
}

export function IngestBehaviorTracker({
  disabled = false,
  messageId,
  conversationId,
  agentId,
  knowledgeBaseId,
  namespace,
  chunkIds = [],
  evidenceIds = [],
  source = "admin_ingest",
  metadata
}: IngestBehaviorTrackerProps) {
  const elementRef = useRef<HTMLSpanElement | null>(null);
  const visibleSinceRef = useRef<number | null>(null);
  const dwellSentRef = useRef(false);

  useEffect(() => {
    const element = elementRef.current;

    if (disabled || !element || !messageId) {
      return;
    }

    const basePayload = {
      messageId,
      conversationId,
      agentId,
      knowledgeBaseId,
      namespace,
      chunkIds,
      evidenceIds,
      source,
      metadata
    };
    const sendDwell = () => {
      if (dwellSentRef.current || visibleSinceRef.current === null) {
        return;
      }

      const dwellMs = Math.max(0, Date.now() - visibleSinceRef.current);

      if (dwellMs < 500) {
        return;
      }

      dwellSentRef.current = true;
      trackIngestBehaviorEvent({
        ...basePayload,
        eventType: "answer_dwell",
        dwellMs
      });
    };
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      if (entry.isIntersecting) {
        if (visibleSinceRef.current === null) {
          visibleSinceRef.current = Date.now();
        }

        trackIngestBehaviorEvent({
          ...basePayload,
          eventType: "answer_view"
        });
      } else {
        sendDwell();
      }
    }, { threshold: 0.5 });
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendDwell();
      }
    };

    observer.observe(element);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      sendDwell();
    };
  }, [agentId, chunkIds, conversationId, disabled, evidenceIds, knowledgeBaseId, messageId, metadata, namespace, source]);

  return <span ref={elementRef} aria-hidden="true" className="sr-only" />;
}
