import type { GptOSActionSuggestion } from "@/lib/enterprise/gpt-os-action-layer";
import type { GptOSPersonaMemory } from "@/lib/enterprise/gpt-os-persona-memory";
import { buildGptOSMemoryIterationUpdate } from "@/lib/enterprise/gpt-os-persona-memory";
import type { GptOSTaskPlan } from "@/lib/enterprise/gpt-os-planner";
import type { GptOSUnifiedContext } from "@/lib/enterprise/gpt-os-multimodal-router";
import { replanGptOSReasoning } from "@/lib/enterprise/gpt-os-replanner";
import type { GptOSGoalState } from "@/lib/enterprise/gpt-os-goal-manager";
import {
  evaluateGptOSResponsePath,
  type GptOSSelfEvaluationResult
} from "@/lib/enterprise/gpt-os-self-evaluator";
import type { AutonomousTaskResult } from "@/lib/enterprise/gpt-os-autonomous-executor";

export type GptOSReasoningPhase = "THINK" | "ACT" | "OBSERVE" | "REFLECT" | "EVALUATE" | "IMPROVE" | "REPLAN" | "FINAL";
export type GptOSReasoningLoopStatus = "running" | "converged" | "max_iterations";

export interface GptOSReasoningLoopStep {
  iteration: number;
  phase: GptOSReasoningPhase;
  agentId: string;
  action: string;
  output: string;
  confidence: number;
  toolFeedback?: string;
  memoryUpdate?: string;
  selfEvaluation?: GptOSSelfEvaluationResult;
  improvementHint?: string;
  replanReason?: string;
  currentStep?: string;
  nextStep?: string;
  needsApproval?: boolean;
  blockedActions?: string[];
}

export interface GptOSReasoningLoopResult {
  status: "internal_only";
  ui: null;
  exposeToUI: false;
  loopActive: true;
  iterations: number;
  currentPhase: GptOSReasoningPhase;
  loopStatus: GptOSReasoningLoopStatus;
  confidence: number;
  toolFeedback: string[];
  memoryUpdates: string[];
  selfEvaluation: GptOSSelfEvaluationResult;
  improvementStatus: GptOSSelfEvaluationResult["improvementStatus"];
  replanTriggered: boolean;
  autonomousTask?: AutonomousTaskResult;
  currentStep?: string;
  nextStep?: string;
  needsApproval: boolean;
  blockedActions: string[];
  steps: GptOSReasoningLoopStep[];
  finalPlan: string[];
}

interface ReasoningLoopInput {
  planner: GptOSTaskPlan;
  memory: GptOSPersonaMemory;
  multimodal: GptOSUnifiedContext;
  selectedAgent: {
    id: string;
    label: string;
    promptModifier: string;
    reasoningInstruction: string;
  };
  goal: GptOSGoalState;
  decisionPolicy: {
    workflowHints: string[];
    toolPermission: boolean;
    maxLoopDepth: number;
    convergenceThreshold: number;
    replanEnabled: boolean;
  };
  actions: GptOSActionSuggestion[];
  confidence: number;
  autonomousTask?: AutonomousTaskResult;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundConfidence(value: number) {
  return Math.round(value * 100) / 100;
}

function selectAction(actions: GptOSActionSuggestion[], iteration: number) {
  return actions[(iteration - 1) % Math.max(actions.length, 1)];
}

function buildToolFeedback(input: ReasoningLoopInput, action?: GptOSActionSuggestion) {
  const riskNotes = input.multimodal.unifiedReasoning.cognitiveFrame.riskNotes;

  if (!input.decisionPolicy.toolPermission) {
    return "Tool execution disabled by agent policy; continue with internal reasoning.";
  }

  if (action) {
    return `${action.label}: ${action.description}`;
  }

  if (riskNotes.length) {
    return `Risk review: ${riskNotes.join("；")}`;
  }

  return "knowledge-search: use unified context and current memory as retrieval feedback.";
}

function improvementFor(input: ReasoningLoopInput, iteration: number, toolFeedback: string) {
  const base = input.planner.complexity === "high" ? 0.1 : input.planner.complexity === "medium" ? 0.08 : 0.05;
  const toolBoost = toolFeedback ? 0.03 : 0;
  const decay = Math.max(0, (iteration - 1) * 0.03);

  return clamp(base + toolBoost - decay, 0.02, 0.14);
}

export function runGptOSReasoningLoop(input: ReasoningLoopInput): GptOSReasoningLoopResult {
  const maxIterations = clamp(input.decisionPolicy.maxLoopDepth || 2, 2, 3);
  const threshold = clamp(input.decisionPolicy.convergenceThreshold || 0.85, 0.72, 0.94);
  const steps: GptOSReasoningLoopStep[] = [];
  const toolFeedback: string[] = [];
  const memoryUpdates: string[] = [];
  let latestEvaluation = evaluateGptOSResponsePath({
    plannerSteps: input.planner.steps,
    finalPlan: input.planner.steps,
    toolFeedback: [],
    memoryUpdates: [],
    confidence: input.confidence,
    loopStatus: "running",
    goalProgress: input.goal.progress,
    approvalRequired: input.autonomousTask?.approvalRequired,
    blockedActions: input.autonomousTask?.blockedActions
  });
  let confidence = clamp(input.confidence, 0.52, 0.9);
  let finalPlan = input.planner.steps;
  let loopStatus: GptOSReasoningLoopStatus = "max_iterations";
  let iterations = 0;
  let replanTriggered = false;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    iterations = iteration;
    const thought = `理解 ${input.multimodal.unifiedReasoning.cognitiveFrame.reasoningGoal}，由 ${input.selectedAgent.label} 持续参与本轮判断。`;

    steps.push({
      iteration,
      phase: "THINK",
      agentId: input.selectedAgent.id,
      action: "think",
      output: thought,
      confidence: roundConfidence(confidence)
    });

    const selectedAction = selectAction(input.actions, iteration);
    const feedback = buildToolFeedback(input, selectedAction);
    toolFeedback.push(feedback);

    steps.push({
      iteration,
      phase: "ACT",
      agentId: input.selectedAgent.id,
      action: selectedAction?.id ?? "knowledge-search",
      output: "把工具/动作结果回流到统一推理上下文。",
      confidence: roundConfidence(confidence),
      toolFeedback: feedback
    });

    const deltaImprovement = improvementFor(input, iteration, feedback);
    confidence = clamp(confidence + deltaImprovement, 0.52, 0.96);

    steps.push({
      iteration,
      phase: "OBSERVE",
      agentId: input.selectedAgent.id,
      action: "observe",
      output: `观察工具反馈与 UnifiedContext 的匹配度，confidence +${deltaImprovement.toFixed(2)}。`,
      confidence: roundConfidence(confidence),
      toolFeedback: feedback
    });

    const memoryUpdate = buildGptOSMemoryIterationUpdate({
      memory: input.memory,
      iteration,
      phase: "REFLECT",
      observation: feedback,
      confidence
    });
    memoryUpdates.push(memoryUpdate);

    steps.push({
      iteration,
      phase: "REFLECT",
      agentId: input.selectedAgent.id,
      action: "reflect",
      output: `基于本轮反馈更新人格/偏好记忆：${memoryUpdate}`,
      confidence: roundConfidence(confidence),
      memoryUpdate
    });

    latestEvaluation = evaluateGptOSResponsePath({
      plannerSteps: input.planner.steps,
      finalPlan,
      toolFeedback,
      memoryUpdates,
      confidence,
      loopStatus,
      goalProgress: input.goal.progress,
      approvalRequired: input.autonomousTask?.approvalRequired,
      blockedActions: input.autonomousTask?.blockedActions
    });

    steps.push({
      iteration,
      phase: "EVALUATE",
      agentId: input.selectedAgent.id,
      action: "self-evaluate",
      output: `自评 clarity=${latestEvaluation.clarity}/10，completeness=${latestEvaluation.completeness}/10，reasoning=${latestEvaluation.reasoningQuality}/10，goal=${latestEvaluation.goalAlignment}/10。`,
      confidence: roundConfidence(confidence),
      selfEvaluation: latestEvaluation
    });

    if (latestEvaluation.improvementNeeded) {
      steps.push({
        iteration,
        phase: "IMPROVE",
        agentId: input.selectedAgent.id,
        action: latestEvaluation.improvementStatus === "rethink" ? "re-think" : "improve",
        output: `根据自评优化路径：${latestEvaluation.improvementHints.join("；")}`,
        confidence: roundConfidence(confidence),
        improvementHint: latestEvaluation.improvementHints.join("；")
      });
    }

    const replanDecision = input.decisionPolicy.replanEnabled
      ? replanGptOSReasoning({
        confidence,
        threshold,
        iteration,
        maxIterations,
        plannerSteps: finalPlan,
        reflection: memoryUpdate,
        toolFeedback,
        deltaImprovement,
        evaluation: latestEvaluation,
        approvalRequired: input.autonomousTask?.approvalRequired,
        blockedActions: input.autonomousTask?.blockedActions
      })
      : {
        shouldReplan: false,
        adjustedSteps: finalPlan,
        reason: "agent policy disabled replanning",
        nextFocus: "finalize",
        confidenceDelta: deltaImprovement
      };

    finalPlan = replanDecision.adjustedSteps;
    replanTriggered = replanTriggered || replanDecision.shouldReplan;

    steps.push({
      iteration,
      phase: "REPLAN",
      agentId: input.selectedAgent.id,
      action: replanDecision.shouldReplan ? "replan" : "finalize-plan",
      output: replanDecision.shouldReplan
        ? `重新规划下一轮重点：${replanDecision.nextFocus}`
        : `停止循环并进入最终回答：${replanDecision.reason}`,
      confidence: roundConfidence(confidence),
      replanReason: replanDecision.reason,
      currentStep: input.autonomousTask?.currentStep,
      nextStep: input.autonomousTask?.nextStep,
      needsApproval: input.autonomousTask?.approvalRequired === true || input.autonomousTask?.status === "needs_approval",
      blockedActions: input.autonomousTask?.blockedActions ?? []
    });

    if (iteration >= 2 && (!replanDecision.shouldReplan || (confidence >= threshold && !latestEvaluation.improvementNeeded))) {
      loopStatus = "converged";
      break;
    }
  }

  return {
    status: "internal_only",
    ui: null,
    exposeToUI: false,
    loopActive: true,
    iterations,
    currentPhase: "FINAL",
    loopStatus,
    confidence: roundConfidence(confidence),
    toolFeedback,
    memoryUpdates,
    selfEvaluation: latestEvaluation,
    improvementStatus: latestEvaluation.improvementStatus,
    replanTriggered,
    autonomousTask: input.autonomousTask,
    currentStep: input.autonomousTask?.currentStep,
    nextStep: input.autonomousTask?.nextStep,
    needsApproval: input.autonomousTask?.approvalRequired === true || input.autonomousTask?.status === "needs_approval",
    blockedActions: input.autonomousTask?.blockedActions ?? [],
    steps,
    finalPlan
  };
}
