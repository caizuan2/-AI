"use client";

import {
  DEFAULT_USER_ANSWER_MODEL_PROVIDER,
  parseUserAnswerModelProvider,
  type UserAnswerModelProvider
} from "@/lib/ai-chat/user-answer-model";
import type { CurrentChatUser } from "../types";
import { getKnowledgeBaseUserIdentity } from "./knowledge-base-selection";

const USER_ANSWER_MODEL_STORAGE_PREFIX = "xiaodong:user:answer-model:v1";

export function getUserAnswerModelStorageKey(
  user: CurrentChatUser | null | undefined
) {
  const identity = getKnowledgeBaseUserIdentity(user);

  return identity
    ? `${USER_ANSWER_MODEL_STORAGE_PREFIX}:${encodeURIComponent(identity)}`
    : null;
}

export function readStoredUserAnswerModel(
  user: CurrentChatUser | null | undefined
): UserAnswerModelProvider {
  if (typeof window === "undefined") {
    return DEFAULT_USER_ANSWER_MODEL_PROVIDER;
  }

  const storageKey = getUserAnswerModelStorageKey(user);

  if (!storageKey) {
    return DEFAULT_USER_ANSWER_MODEL_PROVIDER;
  }

  try {
    return parseUserAnswerModelProvider(window.localStorage.getItem(storageKey))
      ?? DEFAULT_USER_ANSWER_MODEL_PROVIDER;
  } catch {
    return DEFAULT_USER_ANSWER_MODEL_PROVIDER;
  }
}

export function writeStoredUserAnswerModel(
  user: CurrentChatUser | null | undefined,
  provider: UserAnswerModelProvider
) {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getUserAnswerModelStorageKey(user);

  if (!storageKey) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, provider);
  } catch {
    // Model selection is a local UI preference and must never block chat.
  }
}
