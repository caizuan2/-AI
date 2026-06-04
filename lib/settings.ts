import "server-only";

import type { KnowledgeSaveStrategy } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const DEFAULT_SAVE_STRATEGY: KnowledgeSaveStrategy = "MANUAL_CONFIRM";
export const DEFAULT_EXPIRE_DAYS = 90;

export const saveStrategies = [
  "MANUAL_CONFIRM",
  "AUTO_SAVE_AFTER_AI",
  "ANALYZE_ONLY"
] as const satisfies readonly KnowledgeSaveStrategy[];

export interface UserSettingsResponse {
  saveStrategy: KnowledgeSaveStrategy;
  defaultExpireDays: number;
  preferredProvider: string | null;
  preferredModel: string | null;
  ragTopK: number | null;
  ragMinScore: number | null;
  updatedAt: string;
}

export function isSaveStrategy(value: unknown): value is KnowledgeSaveStrategy {
  return typeof value === "string" && saveStrategies.includes(value as KnowledgeSaveStrategy);
}

export async function getOrCreateUserSettings(userId: string): Promise<UserSettingsResponse> {
  const settings = await prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      saveStrategy: DEFAULT_SAVE_STRATEGY,
      defaultExpireDays: DEFAULT_EXPIRE_DAYS
    },
    select: {
      saveStrategy: true,
      defaultExpireDays: true,
      preferredProvider: true,
      preferredModel: true,
      ragTopK: true,
      ragMinScore: true,
      updatedAt: true
    }
  });

  return {
    saveStrategy: settings.saveStrategy,
    defaultExpireDays: settings.defaultExpireDays,
    preferredProvider: settings.preferredProvider,
    preferredModel: settings.preferredModel,
    ragTopK: settings.ragTopK,
    ragMinScore: settings.ragMinScore,
    updatedAt: settings.updatedAt.toISOString()
  };
}

export async function updateUserSettings(
  userId: string,
  input: {
    saveStrategy: KnowledgeSaveStrategy;
    defaultExpireDays: number;
    preferredProvider?: string | null;
    preferredModel?: string | null;
    ragTopK?: number | null;
    ragMinScore?: number | null;
  }
): Promise<UserSettingsResponse> {
  const settings = await prisma.userSettings.upsert({
    where: { userId },
    update: {
      saveStrategy: input.saveStrategy,
      defaultExpireDays: input.defaultExpireDays,
      preferredProvider: input.preferredProvider,
      preferredModel: input.preferredModel,
      ragTopK: input.ragTopK,
      ragMinScore: input.ragMinScore
    },
    create: {
      userId,
      saveStrategy: input.saveStrategy,
      defaultExpireDays: input.defaultExpireDays,
      preferredProvider: input.preferredProvider,
      preferredModel: input.preferredModel,
      ragTopK: input.ragTopK,
      ragMinScore: input.ragMinScore
    },
    select: {
      saveStrategy: true,
      defaultExpireDays: true,
      preferredProvider: true,
      preferredModel: true,
      ragTopK: true,
      ragMinScore: true,
      updatedAt: true
    }
  });

  return {
    saveStrategy: settings.saveStrategy,
    defaultExpireDays: settings.defaultExpireDays,
    preferredProvider: settings.preferredProvider,
    preferredModel: settings.preferredModel,
    ragTopK: settings.ragTopK,
    ragMinScore: settings.ragMinScore,
    updatedAt: settings.updatedAt.toISOString()
  };
}

export function getSaveStrategyRecommendation(saveStrategy: KnowledgeSaveStrategy, shouldSave: boolean) {
  if (saveStrategy === "AUTO_SAVE_AFTER_AI") {
    return shouldSave
      ? "当前保存策略为 AI 判断后自动入库，本次内容值得沉淀，系统将自动保存。"
      : "当前保存策略为 AI 判断后自动入库，但本次内容暂不值得入库，系统不会自动保存。";
  }

  if (saveStrategy === "ANALYZE_ONLY") {
    return "当前保存策略为仅分析，不会自动或手动入库。";
  }

  return shouldSave
    ? "当前保存策略为手动确认入库，请检查整理结果后点击确认入库。"
    : "当前保存策略为手动确认入库，但 AI 暂不建议保存。";
}
