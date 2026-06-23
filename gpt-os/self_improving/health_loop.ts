import { optimizeAgentDesign, type AgentOptimizationRecommendation, type AgentOptimizerInput } from "./agent_optimizer";
import { optimizeRagDesign, type RagOptimizationRecommendation, type RagOptimizerInput } from "./rag_optimizer";
import { optimizeRouterDesign, type RouterOptimizationRecommendation, type RouterOptimizerInput } from "./router_optimizer";
import { optimizeGptOsSystem, type SystemOptimizationPlan, type SystemOptimizerInput } from "./system_optimizer";

export interface SelfImprovingHealthLoopInput {
  system?: SystemOptimizerInput;
  rag?: RagOptimizerInput;
  agent?: AgentOptimizerInput;
  router?: RouterOptimizerInput;
}

export interface SelfImprovingHealthLoopResult {
  bottleneck_detection: string[];
  system_health_score: number;
  optimization_plan: string[];
  performance_improvements: string[];
  architecture_adjustments: string[];
  system_optimizer: SystemOptimizationPlan;
  rag_optimizer: RagOptimizationRecommendation;
  agent_optimizer: AgentOptimizationRecommendation;
  router_optimizer: RouterOptimizationRecommendation;
  is_self_improving: true;
  auto_execute: false;
  approval_mode: "human_approval_required";
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function runSelfImprovingHealthLoop(
  input: SelfImprovingHealthLoopInput = {},
): SelfImprovingHealthLoopResult {
  const systemPlan = optimizeGptOsSystem(input.system);
  const ragPlan = optimizeRagDesign(input.rag);
  const agentPlan = optimizeAgentDesign(input.agent);
  const routerPlan = optimizeRouterDesign(input.router);
  const bottlenecks = [
    ...systemPlan.risk_assessment.reasons.filter((reason) => reason !== "no_critical_risk_detected"),
    ...ragPlan.low_hit_query_analysis.filter((item) => !item.includes("no_low_hit_query")),
    ...agentPlan.workflow_suggestions.filter((item) => item !== "keep_agent_workflow_observed"),
  ];
  const riskPenalty = systemPlan.risk_assessment.risk_level === "high"
    ? 28
    : systemPlan.risk_assessment.risk_level === "medium"
      ? 14
      : 0;
  const bottleneckPenalty = Math.min(35, bottlenecks.length * 5);
  const systemHealthScore = clampScore(92 - riskPenalty - bottleneckPenalty);

  return {
    bottleneck_detection: bottlenecks.length > 0 ? bottlenecks : ["no_critical_bottleneck_detected"],
    system_health_score: systemHealthScore,
    optimization_plan: [
      ...systemPlan.optimization_plan,
      ...ragPlan.embedding_strategy_suggestions,
      ...agentPlan.workflow_suggestions,
      ...routerPlan.routing_strategy_suggestions,
    ],
    performance_improvements: [
      ...systemPlan.performance_improvements,
      `router_chain_candidate:${routerPlan.optimized_fallback_chain.join(">")}`,
    ],
    architecture_adjustments: [
      ...systemPlan.architecture_adjustments,
      ...ragPlan.chunk_structure_suggestions,
      ...agentPlan.proposed_agent_pipeline.map((step) => `agent_pipeline:${step}`),
    ],
    system_optimizer: systemPlan,
    rag_optimizer: ragPlan,
    agent_optimizer: agentPlan,
    router_optimizer: routerPlan,
    is_self_improving: true,
    auto_execute: false,
    approval_mode: "human_approval_required",
  };
}
