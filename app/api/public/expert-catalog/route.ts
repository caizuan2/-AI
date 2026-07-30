import { NextResponse } from "next/server";
import { getExpertCatalog } from "@/lib/super-admin/services/expert-catalog.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const catalog = await getExpertCatalog();
    const activeZones = catalog.zones
      .filter((zone) => zone.status === "active")
      .map((zone) => ({
        zoneKey: zone.zoneKey,
        displayName: zone.displayName,
        sortOrder: zone.sortOrder
      }));
    const activeZoneKeys = new Set(activeZones.map((zone) => zone.zoneKey));
    const activeAgents = catalog.agents
      .filter(
        (agent) =>
          agent.status === "active" &&
          activeZoneKeys.has(agent.zoneKey)
      )
      .map((agent) => ({
        agentKey: agent.agentKey,
        displayName: agent.displayName,
        knowledgeBaseId: agent.knowledgeBaseId,
        namespace: agent.namespace,
        zoneKey: agent.zoneKey,
        sortOrder: agent.sortOrder,
        aliases: agent.aliases,
        avatar: agent.avatar,
        description: agent.description
      }));

    return NextResponse.json({
      ok: true,
      success: true,
      data: {
        zones: activeZones,
        agents: activeAgents
      },
      timestamp: Date.now()
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: {
          code: "EXPERT_CATALOG_UNAVAILABLE",
          message: "专家目录暂不可用。"
        },
        timestamp: Date.now()
      },
      { status: 503 }
    );
  }
}
