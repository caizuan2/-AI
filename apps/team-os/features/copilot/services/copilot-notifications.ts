import "server-only";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { toTeamOsSafeErrorMetadata } from "@/apps/team-os/features/production/services/production-logger";
import { notificationGateway } from "@/apps/team-os/features/notification/services/notification-gateway";
import type { CopilotAccessScope } from "@/apps/team-os/features/copilot/services/copilot-access";
import type {
  CopilotInsightCandidate,
  CopilotInsightRecord
} from "@/apps/team-os/features/copilot/types";

export async function notifyNewCopilotInsights(input: {
  scope: CopilotAccessScope;
  candidates: CopilotInsightCandidate[];
  records: CopilotInsightRecord[];
}) {
  const candidateBySource = new Map(input.candidates.map((candidate) => [candidate.sourceKey, candidate]));
  let createdCount = 0;
  for (const record of input.records) {
    const candidate = candidateBySource.get(record.sourceKey);
    if (!candidate || candidate.priority !== "HIGH") continue;
    const source = `COPILOT:${record.id}`;
    const claimed = await prisma.aIInsight.updateMany({
      where: {
        id: record.id,
        companyId: input.scope.context.companyId,
        targetUserId: input.scope.userId,
        role: input.scope.context.assistantRole,
        status: "ACTIVE",
        notifiedAt: null
      },
      data: { notifiedAt: new Date() }
    });
    if (claimed.count !== 1) continue;
    try {
      const result = await notificationGateway.sendNotification({
        companyId: input.scope.context.companyId,
        teamId: candidate.teamId,
        userId: input.scope.userId,
        type: candidate.notificationType,
        title: candidate.title.slice(0, 160),
        content: candidate.recommendation.slice(0, 500),
        source,
        channels: ["IN_APP"],
        mode: "PRODUCTION"
      });
      const created = result.attempts.filter((attempt) => (
        attempt.channel === "IN_APP" && attempt.status === "CREATED"
      )).length;
      createdCount += created;
      if (created === 0) {
        await prisma.aIInsight.updateMany({
          where: {
            id: record.id,
            companyId: input.scope.context.companyId,
            targetUserId: input.scope.userId,
            role: input.scope.context.assistantRole
          },
          data: { notifiedAt: null }
        });
      }
    } catch (error) {
      await prisma.aIInsight.updateMany({
        where: {
          id: record.id,
          companyId: input.scope.context.companyId,
          targetUserId: input.scope.userId
        },
        data: { notifiedAt: null }
      }).catch(() => undefined);
      logger.warn("team_os_copilot_notification_failed", {
        companyId: input.scope.context.companyId,
        assistantRole: input.scope.context.assistantRole,
        sourceKey: candidate.sourceKey,
        error: toTeamOsSafeErrorMetadata(error)
      });
    }
  }
  return createdCount;
}
