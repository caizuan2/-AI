import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { ingestExperts, ingestExpertZones } from "@/lib/enterprise/mock-experts";
import { resolvePublicExpertScope } from "@/lib/enterprise/public-expert-scope";
import {
  assertAgentUpdateDoesNotChangeBinding,
  assertValidKnowledgeBaseId,
  cleanCatalogText,
  createAgentKey,
  getProtectedExpertBinding,
  isProtectedExpertAgent,
  normalizeCatalogAliases,
  parseCatalogStatus,
  PROTECTED_EXPERT_BINDINGS
} from "@/lib/super-admin/expert-catalog-policy";
import type {
  CreateExpertCatalogAgentInput,
  CreateExpertCatalogZoneInput,
  ExpertCatalogAgent,
  ExpertCatalogSnapshot,
  ExpertCatalogZone,
  UpdateExpertCatalogAgentInput,
  UpdateExpertCatalogZoneInput
} from "@/types/super-admin-expert-catalog";

const BUILT_IN_ZONE_KEYS = new Set<string>(ingestExpertZones.map((zone) => zone.id));

function requireDisplayName(value: unknown) {
  const displayName = cleanCatalogText(value, 80);

  if (!displayName) {
    throw new ValidationError("展示名称不能为空。");
  }

  return displayName;
}

function parseSortOrder(value: unknown, fallback = 0) {
  if (value === undefined) {
    return fallback;
  }

  const sortOrder = Number(value);

  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) {
    throw new ValidationError("排序值必须是 0 到 100000 之间的整数。");
  }

  return sortOrder;
}

function builtInScopeFor(agentKey: string) {
  const scope = resolvePublicExpertScope({ agentId: agentKey });

  if (!scope) {
    throw new ValidationError(`内置 Agent ${agentKey} 缺少固定知识库作用域。`);
  }

  return scope;
}

function builtInKnowledgeBaseIds() {
  return new Set(
    ingestExperts.map((expert) => builtInScopeFor(expert.id).knowledgeBaseId)
  );
}

async function ensureZoneRecord(
  zoneKey: string,
  tx: Pick<typeof prisma, "expertCatalogZone"> = prisma
) {
  const builtInZone = ingestExpertZones.find((zone) => zone.id === zoneKey);
  const existing = await tx.expertCatalogZone.findUnique({ where: { zoneKey } });

  if (existing) {
    return existing;
  }

  if (!builtInZone) {
    throw new NotFoundError("指定专区不存在。");
  }

  return tx.expertCatalogZone.create({
    data: {
      zoneKey,
      displayName: builtInZone.label,
      status: "active",
      sortOrder: ingestExpertZones.findIndex((zone) => zone.id === zoneKey)
    }
  });
}

export async function getExpertCatalog(): Promise<ExpertCatalogSnapshot> {
  const [storedZones, storedAgents] = await Promise.all([
    prisma.expertCatalogZone.findMany(),
    prisma.expertCatalogAgent.findMany({
      include: {
        zone: true
      }
    })
  ]);

  const zoneByKey = new Map(storedZones.map((zone) => [zone.zoneKey, zone]));
  const agentByKey = new Map(storedAgents.map((agent) => [agent.agentKey, agent]));
  const zones: ExpertCatalogZone[] = ingestExpertZones.map((zone, index) => {
    const stored = zoneByKey.get(zone.id);

    return {
      id: stored?.id ?? zone.id,
      zoneKey: zone.id,
      displayName: stored?.displayName ?? zone.label,
      status: stored ? parseCatalogStatus(stored.status) : "active",
      sortOrder: stored?.sortOrder ?? index,
      builtIn: true,
      agentCount: 0
    };
  });

  for (const stored of storedZones) {
    if (BUILT_IN_ZONE_KEYS.has(stored.zoneKey)) {
      continue;
    }

    zones.push({
      id: stored.id,
      zoneKey: stored.zoneKey,
      displayName: stored.displayName,
      status: parseCatalogStatus(stored.status),
      sortOrder: stored.sortOrder,
      builtIn: false,
      agentCount: 0
    });
  }

  const zoneResultByKey = new Map(zones.map((zone) => [zone.zoneKey, zone]));
  const agents: ExpertCatalogAgent[] = ingestExperts.map((expert, index) => {
    const stored = agentByKey.get(expert.id);
    const scope = builtInScopeFor(expert.id);
    const zoneKey = stored?.zone.zoneKey ?? expert.zoneId;
    const zone = zoneResultByKey.get(zoneKey);
    const protectedBinding = isProtectedExpertAgent(expert.id);
    const protectedScope = getProtectedExpertBinding(expert.id);

    return {
      id: stored?.id ?? expert.id,
      agentKey: expert.id,
      displayName: stored?.displayName ?? expert.name,
      knowledgeBaseId: protectedScope?.knowledgeBaseId ?? scope.knowledgeBaseId,
      namespace: protectedScope?.namespace ?? scope.namespace,
      protectedBinding,
      zoneId: zone?.id ?? zoneKey,
      zoneKey,
      zoneName: zone?.displayName ?? expert.zoneTitle,
      status: stored ? parseCatalogStatus(stored.status) : "active",
      sortOrder: stored?.sortOrder ?? index,
      aliases: normalizeCatalogAliases(stored?.aliases ?? [], expert.name),
      avatar: stored?.avatar ?? expert.avatar,
      description: stored?.description ?? expert.description,
      builtIn: true
    };
  });

  const builtInAgentKeys = new Set(ingestExperts.map((expert) => expert.id));

  for (const stored of storedAgents) {
    if (builtInAgentKeys.has(stored.agentKey)) {
      continue;
    }

    const zone = zoneResultByKey.get(stored.zone.zoneKey);
    agents.push({
      id: stored.id,
      agentKey: stored.agentKey,
      displayName: stored.displayName,
      knowledgeBaseId: stored.knowledgeBaseId,
      namespace: stored.namespace,
      protectedBinding: stored.protectedBinding,
      zoneId: stored.zoneId,
      zoneKey: stored.zone.zoneKey,
      zoneName: zone?.displayName ?? stored.zone.displayName,
      status: parseCatalogStatus(stored.status),
      sortOrder: stored.sortOrder,
      aliases: stored.aliases,
      avatar: stored.avatar,
      description: stored.description,
      builtIn: false
    });
  }

  for (const zone of zones) {
    zone.agentCount = agents.filter(
      (agent) => agent.zoneKey === zone.zoneKey && agent.status !== "archived"
    ).length;
  }

  return {
    zones: zones.sort((left, right) => left.sortOrder - right.sortOrder),
    agents: agents.sort((left, right) => {
      const zoneDelta =
        (zoneResultByKey.get(left.zoneKey)?.sortOrder ?? 0) -
        (zoneResultByKey.get(right.zoneKey)?.sortOrder ?? 0);
      return zoneDelta || left.sortOrder - right.sortOrder;
    }),
    protectedAgentKeys: Object.keys(PROTECTED_EXPERT_BINDINGS)
  };
}

export async function createExpertCatalogZone(
  input: CreateExpertCatalogZoneInput
) {
  const displayName = requireDisplayName(input.displayName);
  const zoneKey = `zone-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const maxSort = await prisma.expertCatalogZone.aggregate({
    _max: { sortOrder: true }
  });

  await prisma.expertCatalogZone.create({
    data: {
      zoneKey,
      displayName,
      status: "active",
      sortOrder: (maxSort._max.sortOrder ?? ingestExpertZones.length - 1) + 1
    }
  });

  return (await getExpertCatalog()).zones.find((zone) => zone.zoneKey === zoneKey)!;
}

export async function updateExpertCatalogZone(
  zoneKey: string,
  input: UpdateExpertCatalogZoneInput
) {
  const current = (await getExpertCatalog()).zones.find((zone) => zone.zoneKey === zoneKey);

  if (!current) {
    throw new NotFoundError("专区不存在。");
  }

  const displayName =
    input.displayName === undefined
      ? current.displayName
      : requireDisplayName(input.displayName);
  const status =
    input.status === undefined ? current.status : parseCatalogStatus(input.status);
  const sortOrder = parseSortOrder(input.sortOrder, current.sortOrder);

  if (status === "archived" && current.agentCount > 0) {
    throw new ValidationError("专区仍包含 Agent，请先移动 Agent 后再归档专区。");
  }

  await prisma.expertCatalogZone.upsert({
    where: { zoneKey },
    create: {
      zoneKey,
      displayName,
      status,
      sortOrder
    },
    update: {
      displayName,
      status,
      sortOrder
    }
  });

  return (await getExpertCatalog()).zones.find((zone) => zone.zoneKey === zoneKey)!;
}

export async function createExpertCatalogAgent(
  input: CreateExpertCatalogAgentInput
) {
  const displayName = requireDisplayName(input.displayName);
  const knowledgeBaseId = assertValidKnowledgeBaseId(input.knowledgeBaseId);
  const zoneKey = cleanCatalogText(input.zoneKey, 80);

  if (!zoneKey) {
    throw new ValidationError("必须选择专区。");
  }

  const catalog = await getExpertCatalog();
  const targetZone = catalog.zones.find(
    (zone) => zone.zoneKey === zoneKey && zone.status !== "archived"
  );

  if (!targetZone) {
    throw new NotFoundError("指定专区不存在或已归档。");
  }

  if (
    builtInKnowledgeBaseIds().has(knowledgeBaseId) ||
    catalog.agents.some((agent) => agent.knowledgeBaseId === knowledgeBaseId)
  ) {
    throw new ValidationError("该固定知识库已绑定其他 Agent，不能跨 Agent 复用。");
  }

  const agentKey = createAgentKey(displayName, randomUUID());

  await prisma.$transaction(async (tx) => {
    const zone = await ensureZoneRecord(zoneKey, tx);
    await tx.expertCatalogAgent.create({
      data: {
        agentKey,
        displayName,
        knowledgeBaseId,
        namespace: knowledgeBaseId,
        protectedBinding: false,
        zoneId: zone.id,
        status: "hidden",
        sortOrder: catalog.agents.filter((agent) => agent.zoneKey === zoneKey).length,
        aliases: normalizeCatalogAliases(input.aliases, displayName),
        avatar: cleanCatalogText(input.avatar, 20) || null,
        description: cleanCatalogText(input.description, 500) || null
      }
    });
  });

  return (await getExpertCatalog()).agents.find((agent) => agent.agentKey === agentKey)!;
}

export async function updateExpertCatalogAgent(
  agentKey: string,
  input: UpdateExpertCatalogAgentInput & Record<string, unknown>
) {
  assertAgentUpdateDoesNotChangeBinding(input);
  const catalog = await getExpertCatalog();
  const current = catalog.agents.find((agent) => agent.agentKey === agentKey);

  if (!current) {
    throw new NotFoundError("Agent 不存在。");
  }

  const displayName =
    input.displayName === undefined
      ? current.displayName
      : requireDisplayName(input.displayName);
  const zoneKey =
    input.zoneKey === undefined
      ? current.zoneKey
      : cleanCatalogText(input.zoneKey, 80);
  const targetZone = catalog.zones.find(
    (zone) => zone.zoneKey === zoneKey && zone.status !== "archived"
  );

  if (!targetZone) {
    throw new NotFoundError("指定专区不存在或已归档。");
  }

  const status =
    input.status === undefined ? current.status : parseCatalogStatus(input.status);
  const sortOrder = parseSortOrder(input.sortOrder, current.sortOrder);
  const aliases = normalizeCatalogAliases(
    [...(input.aliases ?? current.aliases), displayName],
    current.displayName
  );

  await prisma.$transaction(async (tx) => {
    const zone = await ensureZoneRecord(zoneKey, tx);
    await tx.expertCatalogAgent.upsert({
      where: { agentKey },
      create: {
        agentKey,
        displayName,
        knowledgeBaseId: current.knowledgeBaseId,
        namespace: current.namespace,
        protectedBinding: current.protectedBinding,
        zoneId: zone.id,
        status,
        sortOrder,
        aliases,
        avatar:
          input.avatar === undefined
            ? current.avatar
            : cleanCatalogText(input.avatar, 20) || null,
        description:
          input.description === undefined
            ? current.description
            : cleanCatalogText(input.description, 500) || null
      },
      update: {
        displayName,
        zoneId: zone.id,
        status,
        sortOrder,
        aliases,
        avatar:
          input.avatar === undefined
            ? current.avatar
            : cleanCatalogText(input.avatar, 20) || null,
        description:
          input.description === undefined
            ? current.description
            : cleanCatalogText(input.description, 500) || null
      }
    });
  });

  return (await getExpertCatalog()).agents.find((agent) => agent.agentKey === agentKey)!;
}

export async function archiveExpertCatalogAgent(agentKey: string) {
  return updateExpertCatalogAgent(agentKey, { status: "archived" });
}
