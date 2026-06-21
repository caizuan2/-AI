import {
  routeGptOSAgent,
  type GptOSAgentDefinition,
  type GptOSAgentDecisionPolicy,
  type GptOSRouteInput
} from "@/lib/enterprise/gpt-os-agent-router";
import {
  selectGptOSPlugins,
  type GptOSPluginCall,
  type GptOSToolResult
} from "@/lib/enterprise/gpt-os-plugin-registry";
import { DEFAULT_GPT_OS_CONVERGENCE_BUDGET } from "@/lib/enterprise/gpt-os-convergence-controller";
import {
  estimateGptOSCost,
  type GptOSCostBreakdown
} from "@/lib/enterprise/gpt-os-cost-tracker";
import {
  validateGptOSModelTruth,
  type GptOSModelTruth
} from "@/lib/enterprise/gpt-os-model-truth-layer";
import { detectGptOSAutoUXMode } from "@/lib/enterprise/gpt-os-auto-ux-detector";
import type { GptOSExperienceMode } from "@/lib/enterprise/gpt-os-experience-layer";

export type GptOSWorkflowStepId =
  | "analyze-intent"
  | "retrieve-context"
  | "select-agent"
  | "call-model"
  | "run-plugins"
  | "format-output"
  | "init"
  | "plan"
  | "retrieve"
  | "tool-decision"
  | "tool-execute"
  | "reasoning"
  | "refine"
  | "final"
  | "analyze"
  | "execute"
  | "tool"
  | "rethink"
  | "loop";

export type GptOSWorkflowStepStatus = "pending" | "running" | "done" | "skipped";

export interface GptOSWorkflowStep {
  id: GptOSWorkflowStepId;
  label: string;
  status: GptOSWorkflowStepStatus;
  detail: string;
}

export interface GptOSSemanticTraceEntry {
  step: string;
  reasoning: string;
  toolUsed: string[];
  decision: string;
}

export interface GptOSToolTraceEntry {
  pluginId: string;
  pluginName: string;
  stage: string;
  loopIndex: number;
  nextAction: string;
  summary: string;
}

export interface GptOSWorkflowExecution {
  id: string;
  osMode: "EXECUTION_KERNEL" | "AUTONOMOUS" | "FULL_AUTONOMY" | "AUTONOMOUS_CONVERGED" | "INTELLIGENT_OBSERVABLE";
  selectedAgent: GptOSAgentDefinition;
  decisionPolicy: GptOSAgentDecisionPolicy;
  confidence: number;
  matchedSignals: string[];
  plugins: GptOSPluginCall[];
  toolResults: GptOSToolResult[];
  steps: GptOSWorkflowStep[];
  summary: string;
  diagnostics: string[];
  memoryHints: string[];
  runtime: {
    agentInstruction: string;
    reasoningStyle: string;
    outputContract: string;
    workflow: string[];
    toolsUsed: string[];
    executionSteps: number;
    workflowGenerated: boolean;
    toolLoopCount: number;
    reasoningDepth: "low" | "medium" | "high";
    decisionStates: string[];
    modelPasses: number;
    loopCount: number;
    toolCalls: number;
    replanCount: number;
    confidence: number;
    deltaImprovement: number;
    converged: boolean;
    convergenceStopReason: string;
    costOptimized: boolean;
    maxToolCalls: number;
    maxRetries: number;
    prunedSteps: string[];
    osLoopActive: boolean;
    toolTriggered: boolean;
    gptRecalled: boolean;
    autonomyValid: boolean;
    maxLoopDepth: number;
    fallbackUsed: boolean;
    errorHandled: boolean;
    fallbackModel: "none" | "deepseek" | "qwen" | "safe-fallback";
    userFacingError: boolean;
    systemRecovered: boolean;
    cost: GptOSCostBreakdown;
    costTracked: boolean;
    modelTruth: GptOSModelTruth;
    modelVerified: boolean;
    fallbackTransparent: boolean;
    semanticTraceEnabled: boolean;
    reasoningTrace: GptOSSemanticTraceEntry[];
    toolTrace: GptOSToolTraceEntry[];
    whyThisAnswer: string[];
    uxMode: "auto" | GptOSExperienceMode;
    detectedUxMode: GptOSExperienceMode;
    uxReason: string;
    uxSignals: string[];
    uxConfidence: number;
  };
}

export interface GptOSWorkflowInput extends GptOSRouteInput {
  workflowState?: "planned" | "running" | "completed";
}

function statusFor(input: GptOSWorkflowInput, step: GptOSWorkflowStepId): GptOSWorkflowStepStatus {
  if (input.workflowState === "completed") {
    return "done";
  }

  if (step === "analyze-intent" || step === "select-agent" || step === "init" || step === "analyze" || step === "plan") {
    return "done";
  }

  if (input.workflowState === "running" && (step === "call-model" || step === "reasoning" || step === "execute")) {
    return "running";
  }

  if (step === "retrieve-context" || step === "retrieve") {
    return input.attachments?.length || input.recentMessages?.length ? "done" : "pending";
  }

  return "pending";
}

function getReasoningDepth(policy: GptOSAgentDecisionPolicy, text: string): "low" | "medium" | "high" {
  if (policy.reasoningDepth === "high" || policy.reasoningStrategy === "deep" || /深度|复杂|系统|合规|风险|为什么|分析|多轮/.test(text)) {
    return "high";
  }

  if (policy.reasoningDepth === "low" || policy.reasoningStrategy === "fast") {
    return "low";
  }

  return "medium";
}

function generateDynamicWorkflow(input: GptOSWorkflowInput, policy: GptOSAgentDecisionPolicy, pluginCount: number) {
  const needsRetrieve = policy.workflowHints.includes("use_rag") || Boolean(input.attachments?.length) || /知识|检索|RAG|入库|用户端/.test(input.text);
  const needsTool = policy.toolPermission && (policy.workflowHints.includes("use_tool") || pluginCount > 0);
  const needsMultiStep = policy.workflowHints.includes("multi_step") || /深度|多轮|复杂|系统|方案|为什么|合规|风险/.test(input.text);
  const needsRefine = policy.workflowHints.includes("refine_output") || needsTool || needsMultiStep;
  const states = [
    "init",
    "analyze",
    "plan",
    "execute",
    ...(needsRetrieve ? ["retrieve"] : []),
    ...(needsTool ? ["tool"] : []),
    ...(needsMultiStep ? ["rethink"] : []),
    ...(needsRefine ? ["loop"] : []),
    "final"
  ];

  return {
    states,
    needsRetrieve,
    needsTool,
    needsMultiStep,
    needsRefine,
    reasoningDepth: getReasoningDepth(policy, input.text),
    toolLoopCount: needsTool && needsMultiStep ? Math.min(3, policy.maxLoopDepth) : needsTool ? 1 : 0,
    modelPasses: needsMultiStep ? Math.min(3, policy.maxLoopDepth) : 1
  };
}

function toStepId(state: string): GptOSWorkflowStepId {
  if (state === "tool_decision") return "tool-decision";
  if (state === "tool_execute") return "tool-execute";
  if (state === "finalize") return "final";

  return state as GptOSWorkflowStepId;
}

function toStepLabel(state: string) {
  const labels: Record<string, string> = {
    init: "Init",
    analyze: "Analyze Intent",
    plan: "Generate Plan",
    execute: "Execute Step",
    retrieve: "Retrieve Context",
    tool_decision: "Tool Decision",
    tool_execute: "Tool Execute",
    tool: "Tool Loop",
    reasoning: "Reasoning Loop",
    rethink: "Rethink / Replan",
    loop: "Autonomy Loop",
    refine: "Refine Output",
    final: "Final Output"
  };

  return labels[state] ?? state;
}

function buildDynamicSteps(input: GptOSWorkflowInput, states: string[], routeReason: string, pluginNames: string[]) {
  return states.map((state): GptOSWorkflowStep => ({
    id: toStepId(state),
    label: toStepLabel(state),
    status: statusFor(input, toStepId(state)),
    detail: state === "plan"
      ? routeReason
      : state === "tool_execute" || state === "tool"
        ? pluginNames.join(" / ") || "本轮无需工具"
        : state === "retrieve"
          ? input.attachments?.length ? `纳入 ${input.attachments.length} 个附件与最近对话。` : "根据上下文决定是否检索。"
          : "自治状态机动态生成。"
  }));
}

export function planGptOSWorkflow(input: GptOSWorkflowInput): GptOSWorkflowExecution {
  const route = routeGptOSAgent(input);
  const uxDecision = detectGptOSAutoUXMode(input.text);
  const plugins = selectGptOSPlugins({
    text: input.text,
    selectedAgentId: route.selectedAgent.id,
    attachments: input.attachments,
    preferredPluginIds: route.selectedAgent.preferredPluginIds
  });
  const workflowState = input.workflowState ?? "planned";
  const generatedWorkflow = generateDynamicWorkflow(input, route.decisionPolicy, plugins.length);
  // Workflow 现在按 Agent 决策和输入动态生成；仍不触碰 RAG / DB / 模型实现。
  const steps = buildDynamicSteps(
    { ...input, workflowState },
    generatedWorkflow.states,
    route.reason,
    plugins.map((call) => call.plugin.name)
  );

  return {
    id: `gpt-os-${route.selectedAgent.id}`,
    osMode: "FULL_AUTONOMY",
    selectedAgent: route.selectedAgent,
    decisionPolicy: route.decisionPolicy,
    confidence: route.confidence,
    matchedSignals: route.matchedSignals,
    plugins,
    toolResults: [],
    steps,
    summary: `${route.selectedAgent.name} 将按 ${plugins.length} 个插件计划执行：${plugins.map((item) => item.plugin.name).join("、")}`,
    diagnostics: [
      "osMode:FULL_AUTONOMY",
      `agent:${route.selectedAgent.id}`,
      `agentMode:${route.decisionPolicy.mode}`,
      `confidence:${route.confidence.toFixed(2)}`,
      `plugins:${plugins.map((item) => item.plugin.id).join(",") || "none"}`,
      `reasoning:${generatedWorkflow.reasoningDepth}`,
      `workflowGenerated:true`,
      `toolLoopCount:${generatedWorkflow.toolLoopCount}`,
      `maxLoopDepth:${route.decisionPolicy.maxLoopDepth}`,
      `maxToolCalls:${DEFAULT_GPT_OS_CONVERGENCE_BUDGET.maxToolCalls}`,
      `convergenceThreshold:${route.decisionPolicy.convergenceThreshold.toFixed(2)}`,
      `costAware:${route.decisionPolicy.costAware ? "true" : "false"}`,
      `replanEnabled:${route.decisionPolicy.replanEnabled ? "true" : "false"}`,
      `uxMode:${route.decisionPolicy.uxMode}`,
      `detectedUxMode:${uxDecision.mode}`,
      `uxConfidence:${uxDecision.confidence.toFixed(2)}`,
      `uxSignals:${uxDecision.matchedSignals.join(",") || "none"}`,
      "costTracked:false",
      "modelVerified:false",
      "semanticTraceEnabled:true",
      "fallbackTransparent:true"
    ],
    memoryHints: [
      route.selectedAgent.systemFocus,
      route.selectedAgent.outputBias
    ],
    runtime: {
      agentInstruction: route.selectedAgent.promptModifier,
      reasoningStyle: route.selectedAgent.reasoningStyle,
      outputContract: route.selectedAgent.outputContract,
      workflow: generatedWorkflow.states,
      toolsUsed: plugins.map((item) => item.plugin.id),
      executionSteps: generatedWorkflow.states.length,
      workflowGenerated: true,
      toolLoopCount: generatedWorkflow.toolLoopCount,
      reasoningDepth: generatedWorkflow.reasoningDepth,
      decisionStates: generatedWorkflow.states,
      modelPasses: generatedWorkflow.modelPasses,
      loopCount: 0,
      toolCalls: 0,
      replanCount: 0,
      confidence: route.confidence,
      deltaImprovement: 1,
      converged: false,
      convergenceStopReason: "pending",
      costOptimized: true,
      maxToolCalls: DEFAULT_GPT_OS_CONVERGENCE_BUDGET.maxToolCalls,
      maxRetries: DEFAULT_GPT_OS_CONVERGENCE_BUDGET.maxRetries,
      prunedSteps: [],
      osLoopActive: false,
      toolTriggered: false,
      gptRecalled: false,
      autonomyValid: false,
      maxLoopDepth: route.decisionPolicy.maxLoopDepth,
      fallbackUsed: false,
      errorHandled: false,
      fallbackModel: "none",
      userFacingError: false,
      systemRecovered: false,
      cost: estimateGptOSCost(),
      costTracked: false,
      modelTruth: validateGptOSModelTruth({ expectedModel: "gpt-5.5" }),
      modelVerified: false,
      fallbackTransparent: true,
      semanticTraceEnabled: true,
      reasoningTrace: [
        {
          step: "analyze",
          reasoning: `Selected ${route.selectedAgent.name} because ${route.reason}`,
          toolUsed: plugins.map((item) => item.plugin.id),
          decision: `Workflow states: ${generatedWorkflow.states.join(" -> ")}`
        }
      ],
      toolTrace: [],
      whyThisAnswer: [
        `Selected ${route.selectedAgent.name} because ${route.reason}`,
        `Auto UX selected ${uxDecision.mode.toUpperCase()} because ${uxDecision.reason}.`,
        generatedWorkflow.needsRetrieve
          ? "Used the retrieval path because the task references knowledge, files, or recent context."
          : "Used current task context without forcing extra retrieval.",
        plugins.length
          ? `Enabled tools for observability and verification: ${plugins.map((item) => item.plugin.name).join(" / ")}.`
          : "No plugin was required during initial planning."
      ],
      uxMode: route.decisionPolicy.uxMode,
      detectedUxMode: uxDecision.mode,
      uxReason: uxDecision.reason,
      uxSignals: uxDecision.matchedSignals,
      uxConfidence: uxDecision.confidence
    }
  };
}

export function completeGptOSWorkflow(
  execution: GptOSWorkflowExecution,
  toolResults: GptOSToolResult[]
): GptOSWorkflowExecution {
  const toolsUsed = Array.from(new Set([
    ...execution.runtime.toolsUsed,
    ...toolResults.map((result) => result.pluginId)
  ]));

  // Workflow 完成态保留原执行上下文，只补齐工具结果和 step 状态。
  return {
    ...execution,
    plugins: execution.plugins.map((item) => ({ ...item, status: "completed" as const })),
    toolResults,
    steps: execution.steps.map((step) => ({ ...step, status: "done" as const })),
    diagnostics: [
      ...execution.diagnostics,
      `osMode:${execution.osMode}`,
      `toolsUsed:${toolsUsed.join(",")}`,
      `executionSteps:${execution.runtime.workflow.length}`,
      `workflowGenerated:${execution.runtime.workflowGenerated ? "true" : "false"}`,
      `toolLoopCount:${execution.runtime.toolLoopCount}`,
      `reasoningDepth:${execution.runtime.reasoningDepth}`,
      `loopCount:${execution.runtime.loopCount}`,
      `toolCalls:${execution.runtime.toolCalls}`,
      `replanCount:${execution.runtime.replanCount}`,
      `confidence:${execution.runtime.confidence.toFixed(2)}`,
      `deltaImprovement:${execution.runtime.deltaImprovement.toFixed(2)}`,
      `converged:${execution.runtime.converged ? "true" : "false"}`,
      `convergenceStopReason:${execution.runtime.convergenceStopReason}`,
      `costOptimized:${execution.runtime.costOptimized ? "true" : "false"}`,
      `maxToolCalls:${execution.runtime.maxToolCalls}`,
      `maxRetries:${execution.runtime.maxRetries}`,
      `prunedSteps:${execution.runtime.prunedSteps.join(",") || "none"}`,
      `osLoopActive:${execution.runtime.osLoopActive ? "true" : "false"}`,
      `toolTriggered:${execution.runtime.toolTriggered ? "true" : "false"}`,
      `gptRecalled:${execution.runtime.gptRecalled ? "true" : "false"}`,
      `autonomyValid:${execution.runtime.autonomyValid ? "true" : "false"}`,
      "observableOsMode:INTELLIGENT_OBSERVABLE",
      `costTracked:${execution.runtime.costTracked ? "true" : "false"}`,
      `estimatedCost:${execution.runtime.cost.totalCost.toFixed(6)}`,
      `totalTokens:${execution.runtime.cost.totalTokens}`,
      `modelVerified:${execution.runtime.modelTruth.modelVerified ? "true" : "false"}`,
      `actualModel:${execution.runtime.modelTruth.actualModel || "unknown"}`,
      `expectedModel:${execution.runtime.modelTruth.expectedModel}`,
      `fallbackTransparent:${execution.runtime.fallbackTransparent ? "true" : "false"}`,
      `fallbackUsed:${execution.runtime.modelTruth.fallbackUsed ? "true" : "false"}`,
      `errorHandled:${execution.runtime.errorHandled ? "true" : "false"}`,
      `fallbackModel:${execution.runtime.fallbackModel}`,
      `userFacingError:${execution.runtime.userFacingError ? "true" : "false"}`,
      `systemRecovered:${execution.runtime.systemRecovered ? "true" : "false"}`,
      `semanticTraceEnabled:${execution.runtime.semanticTraceEnabled ? "true" : "false"}`,
      `reasoningTrace:${execution.runtime.reasoningTrace.length}`,
      `toolTrace:${execution.runtime.toolTrace.length}`,
      `uxMode:${execution.runtime.uxMode}`,
      `detectedUxMode:${execution.runtime.detectedUxMode}`,
      `uxReason:${execution.runtime.uxReason}`
    ],
    runtime: {
      ...execution.runtime,
      toolsUsed,
      executionSteps: execution.runtime.workflow.length
    }
  };
}

export function formatGptOSPromptBlock(execution?: GptOSWorkflowExecution | null) {
  if (!execution) {
    return "GPT OS: 未提供显式路由上下文，请按现有 Agent、记忆、RAG 和用户意图自然判断。";
  }

  return [
    `OS mode: ${execution.osMode}`,
    `GPT OS Agent: ${execution.selectedAgent.name} (${execution.selectedAgent.role})`,
    `Agent decision: mode=${execution.decisionPolicy.mode}; strategy=${execution.decisionPolicy.reasoningStrategy}; depth=${execution.decisionPolicy.reasoningDepth}; toolLoop=${execution.decisionPolicy.allowToolLoop ? "true" : "false"}; maxLoopDepth=${execution.decisionPolicy.maxLoopDepth}; convergenceThreshold=${execution.decisionPolicy.convergenceThreshold.toFixed(2)}; costAware=${execution.decisionPolicy.costAware ? "true" : "false"}; replan=${execution.decisionPolicy.replanEnabled ? "true" : "false"}; hints=${execution.decisionPolicy.workflowHints.join(",")}`,
    `Routing confidence: ${execution.confidence.toFixed(2)}`,
    `Matched signals: ${execution.matchedSignals.length ? execution.matchedSignals.join("、") : "default"}`,
    `Workflow: ${execution.steps.map((step) => `${step.label}=${step.status}`).join(" -> ")}`,
    `Plugins: ${execution.plugins.map((call) => `${call.plugin.name}: ${call.reason}`).join(" | ")}`,
    `Agent instruction: ${execution.runtime.agentInstruction}`,
    `Reasoning style: ${execution.runtime.reasoningStyle}`,
    `Autonomous loop: workflowGenerated=${execution.runtime.workflowGenerated ? "true" : "false"}; loopCount=${execution.runtime.loopCount}; toolCalls=${execution.runtime.toolCalls}; replanCount=${execution.runtime.replanCount}; toolLoopCount=${execution.runtime.toolLoopCount}; reasoningDepth=${execution.runtime.reasoningDepth}; modelPasses=${execution.runtime.modelPasses}; confidence=${execution.runtime.confidence.toFixed(2)}; deltaImprovement=${execution.runtime.deltaImprovement.toFixed(2)}; converged=${execution.runtime.converged ? "true" : "false"}; costOptimized=${execution.runtime.costOptimized ? "true" : "false"}; stopReason=${execution.runtime.convergenceStopReason}; osLoopActive=${execution.runtime.osLoopActive ? "true" : "false"}; toolTriggered=${execution.runtime.toolTriggered ? "true" : "false"}; gptRecalled=${execution.runtime.gptRecalled ? "true" : "false"}; autonomyValid=${execution.runtime.autonomyValid ? "true" : "false"}`,
    `Observability: costTracked=${execution.runtime.costTracked ? "true" : "false"}; estimatedCost=${execution.runtime.cost.totalCost.toFixed(6)}; tokens=${execution.runtime.cost.totalTokens}; modelVerified=${execution.runtime.modelTruth.modelVerified ? "true" : "false"}; actualModel=${execution.runtime.modelTruth.actualModel || "unknown"}; fallbackUsed=${execution.runtime.modelTruth.fallbackUsed ? "true" : "false"}; errorHandled=${execution.runtime.errorHandled ? "true" : "false"}; fallbackModel=${execution.runtime.fallbackModel}; userFacingError=${execution.runtime.userFacingError ? "true" : "false"}; systemRecovered=${execution.runtime.systemRecovered ? "true" : "false"}; semanticTrace=${execution.runtime.reasoningTrace.length}`,
    `Auto UX: mode=${execution.runtime.uxMode}; detected=${execution.runtime.detectedUxMode}; reason=${execution.runtime.uxReason}; signals=${execution.runtime.uxSignals.join(",") || "none"}`,
    `Output contract: ${execution.runtime.outputContract}`,
    `Tool results: ${execution.toolResults.length ? execution.toolResults.map((result) => `${result.pluginName}: ${result.summary}`).join(" | ") : "pending"}`,
    `Agent focus: ${execution.memoryHints.join(" ")}`
  ].join("\n");
}
