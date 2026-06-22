import type { RequestContext, RouteDecision } from "@/types/orchestrator";

export function decideRoute(context: RequestContext): RouteDecision {
  if (context.role === "super_admin") {
    return {
      route: "super-admin",
      flow: "system_control",
      service: "system-service"
    };
  }

  if (context.role === "ingest_admin") {
    return {
      route: "ingest",
      flow: "knowledge_training",
      service: "knowledge-service"
    };
  }

  return {
    route: "user",
    flow: "ai_chat",
    service: "ai-gateway"
  };
}
