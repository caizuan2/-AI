import type {
  RuntimeV2AgentPolicy,
  RuntimeV2Context,
  RuntimeV2Input,
  RuntimeV2Memory,
  RuntimeV2MemoryTraceItem,
  RuntimeV2Source,
} from "./runtime-v2-types";
import { buildFreeformOutputInstruction } from "./runtime-v2-freeform-output-policy";
import { buildRuntimeV2ComplianceInstruction } from "./runtime-v2-compliance-boundary";
import { buildRuntimeV2DecisionGuide } from "./runtime-v2-decision-guide-policy";
import { buildHighDensityAnswerInstruction } from "./runtime-v2-high-density-answer-policy";
import { classifyRuntimeV2UserIntent } from "./runtime-v2-intent-classifier";
import { buildObjectionHandlingPlan } from "./runtime-v2-objection-handler";
import { buildRuntimeV2SalesFollowupPlan } from "./runtime-v2-sales-followup-policy";
import { classifyRuntimeV2SalesIntent } from "./runtime-v2-sales-intent-classifier";
import { buildRuntimeV2SalesLoop } from "./runtime-v2-sales-loop-output";
import { buildSalesLoopV2 } from "./runtime-v2-sales-loop-v2-output";
import { buildRuntimeV2TrustBuildingMessage } from "./runtime-v2-trust-building-policy";

function joinLines(lines: string[]): string {
  return lines.filter(Boolean).join("\n");
}

export function buildRuntimeV2Context(input: {
  scope: RuntimeV2Input;
  sources: RuntimeV2Source[];
  memories: RuntimeV2Memory[];
  memoryTrace?: RuntimeV2MemoryTraceItem[];
  policies: RuntimeV2AgentPolicy[];
}): RuntimeV2Context {
  const { scope, sources, memories, memoryTrace = [], policies } = input;
  const intentProfile = classifyRuntimeV2UserIntent(scope);
  const salesProfile = classifyRuntimeV2SalesIntent(scope, { sources });
  const objectionPlan = buildObjectionHandlingPlan({ scope, salesProfile, sources, memoryTrace });
  const followupPlan = buildRuntimeV2SalesFollowupPlan(scope, salesProfile);
  const salesLoopPlan = buildRuntimeV2SalesLoop({ scope, sources, memories, memoryTrace });
  const salesLoopV2 = buildSalesLoopV2({
    scope,
    sources,
    memories,
    memoryTrace,
    salesIntent: salesProfile.salesIntent,
    salesLoopPlan,
  });
  const trustPlan = buildRuntimeV2TrustBuildingMessage(scope, sources);
  const decisionGuide = buildRuntimeV2DecisionGuide(scope);
  const sourceLines = sources
    .slice(0, 5)
    .map((source, index) => `${index + 1}. ${source.title}${source.safeSnippet ? ` - ${source.safeSnippet}` : ""}`);
  const memoryLines = memories
    .slice(0, 5)
    .map((memory, index) => `${index + 1}. ${memory.title ?? memory.id}: ${memory.content}`);
  const policyLines = policies.map((policy) => `- ${policy.label}: ${policy.instructions.join(" ")}`);

  return {
    promptContext: joinLines([
      `[Runtime v2] mode=${scope.outputMode}`,
      `[Intent]\nintent=${intentProfile.intent}; outputMode=${intentProfile.outputMode}; requiresTable=${intentProfile.requiresTable}; requiresCustomerCopy=${intentProfile.requiresCustomerCopy}; reason=${intentProfile.reason}`,
      `[Sales Intent]\nsalesIntent=${salesProfile.salesIntent}; customerStage=${salesProfile.customerStage}; strategy=${salesProfile.recommendedStrategy}; confidence=${salesProfile.confidence}; reason=${salesProfile.reason}`,
      `[Objection Handling]\ndiagnosis=${objectionPlan.diagnosis}\ncustomerPsychology=${objectionPlan.customerPsychology}\nresponseStrategy=${objectionPlan.responseStrategy}\nnextAction=${objectionPlan.nextAction}`,
      salesProfile.salesIntent === "cycle_choice"
        ? `[33/77 Decision Guide]\n${decisionGuide.answer}\nCustomer copy=${decisionGuide.customerCopy}`
        : "",
      salesProfile.salesIntent === "trust_building" || salesProfile.salesIntent === "effect_doubt"
        ? `[Trust Building]\n${trustPlan.answer}\nCustomer copy=${trustPlan.customerCopy}`
        : "",
      `[Sales Followup]\ngoal=${followupPlan.followupGoal}\nnextQuestion=${followupPlan.nextQuestion}\nnextMessage=${followupPlan.nextMessage}`,
      `[Sales Loop]\nstage=${salesLoopPlan.customerStage}; confidence=${salesLoopPlan.confidence}; signals=${salesLoopPlan.dealSignals.map((signal) => signal.label).join("、")}; nextQuestion=${salesLoopPlan.nextQuestion}`,
      `[Sales Loop v2]\nprobability=${salesLoopV2.dealProbability.probability}; score=${salesLoopV2.dealProbability.score}; silenceRisk=${salesLoopV2.silenceRisk.silenceRisk}; riskType=${salesLoopV2.silenceRisk.riskType}; recommendedAction=${salesLoopV2.recommendedAction}`,
      `[AB Script Strategy]\nrecommend=${salesLoopV2.abScripts.recommendation}; reason=${salesLoopV2.abScripts.reason}\nA=${salesLoopV2.abScripts.variantA.message}\nB=${salesLoopV2.abScripts.variantB.message}`,
      `[Multi Turn Sales Path]\ncurrentStep=${salesLoopV2.multiTurnPath.currentStep}; nextBestAction=${salesLoopV2.multiTurnPath.nextBestAction}\n${salesLoopV2.multiTurnPath.path.map((step) => `${step.step}. ${step.goal}｜${step.userAction}｜${step.nextReply}`).join("\n")}`,
      salesLoopPlan.followupSequence.length > 0
        ? `[Followup Sequence]\n${salesLoopPlan.followupSequence.map((step) => `${step.step}. ${step.timing}｜${step.goal}｜${step.message}`).join("\n")}`
        : "",
      `[Followup Timing]\nimmediate=${salesLoopV2.followupTiming.immediate}\nlater=${salesLoopV2.followupTiming.later}\nfinalClose=${salesLoopV2.followupTiming.finalClose}\nwaitRecommendation=${salesLoopV2.followupTiming.waitRecommendation}`,
      `[Stop Push Policy]\nshouldStop=${salesLoopV2.stopPush.shouldStop}; rules=${salesLoopV2.stopPush.stopRules.join("；")}; respectfulClose=${salesLoopV2.stopPush.respectfulCloseMessage}`,
      `[No Harassment Rules]\n${salesLoopPlan.stopRules.join("\n")}`,
      buildRuntimeV2ComplianceInstruction(scope, salesProfile),
      buildFreeformOutputInstruction(scope),
      buildHighDensityAnswerInstruction(scope),
      sourceLines.length > 0 ? `[Knowledge]\n${sourceLines.join("\n")}` : "",
      memoryLines.length > 0 ? `[Memory v2 - scoped recall]\n${memoryLines.join("\n")}` : "",
      policyLines.length > 0 ? `[Policies]\n${policyLines.join("\n")}` : "",
      `[Current user question]\n${scope.query}`,
    ]),
    usedMemoryIds: memories.map((memory) => memory.id),
    memoryTrace,
    appliedAgentPolicies: policies.map((policy) => policy.id),
  };
}
