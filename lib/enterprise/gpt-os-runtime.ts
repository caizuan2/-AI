import type { GptOSAgentDefinition } from "@/lib/enterprise/gpt-os-agent-router";
import {
  completeGptOSWorkflow,
  planGptOSWorkflow,
  type GptOSSemanticTraceEntry,
  type GptOSToolTraceEntry,
  type GptOSWorkflowExecution,
  type GptOSWorkflowInput
} from "@/lib/enterprise/gpt-os-workflow-engine";
import {
  runGptOSToolExecutor,
  type GptOSToolResult
} from "@/lib/enterprise/gpt-os-plugin-registry";
import {
  evaluateGptOSConvergence,
  getGptOSConvergenceBudget,
  type GptOSConvergenceEvaluation
} from "@/lib/enterprise/gpt-os-convergence-controller";
import { detectGptOSAutoUXMode } from "@/lib/enterprise/gpt-os-auto-ux-detector";
import {
  GPT_OS_SAFE_FALLBACK_MESSAGE,
  normalizeGptOSError
} from "@/lib/enterprise/gpt-os-error-handler";
import { buildGptOSErrorUX } from "@/lib/enterprise/gpt-os-error-ux-layer";

export interface GptOSRuntimeInput extends GptOSWorkflowInput {
  tenantId?: string | null;
  userId?: string | null;
}

export type OSState =
  | "init"
  | "analyze"
  | "plan"
  | "execute"
  | "tool"
  | "rethink"
  | "loop"
  | "final";

export interface GptOSAutonomousDecision {
  states: OSState[];
  needsRag: boolean;
  shouldUseTools: boolean;
  needsMultiRoundReasoning: boolean;
  shouldRefine: boolean;
  reasoningDepth: "low" | "medium" | "high";
  toolLoopCount: number;
  modelPasses: number;
  maxSteps: number;
  replanEnabled: boolean;
  rationale: string[];
}

export interface GptOSAgentRuntime {
  agent: GptOSAgentDefinition;
  instruction: string;
  reasoningStyle: string;
  outputContract: string;
}

export interface GptOSRuntimeContext {
  execution: GptOSWorkflowExecution;
  agentRuntime: GptOSAgentRuntime;
  decision: GptOSAutonomousDecision;
  preToolResults: GptOSToolResult[];
  postToolResults: GptOSToolResult[];
  modelInput: string;
  dynamicPrompt: string;
}

export interface GptOSPipelineResult<T> {
  result: T;
  execution: GptOSWorkflowExecution;
  context: GptOSRuntimeContext;
}

export interface GptOSPipelineHandlers<T> {
  callModel: (context: GptOSRuntimeContext) => Promise<T>;
  readModelText?: (result: T) => string;
  refineResult?: (result: T, context: GptOSRuntimeContext) => T | Promise<T>;
  createFallbackResult?: (error: unknown, context: GptOSRuntimeContext) => T | Promise<T>;
}

function isRuntimeRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function collectRuntimeText(value: unknown, depth = 0): string[] {
  if (depth > 5) {
    return [];
  }

  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectRuntimeText(item, depth + 1));
  }

  if (!isRuntimeRecord(value)) {
    return [];
  }

  return [
    value.replyMarkdown,
    value.output_text,
    value.text,
    value.content,
    value.message,
    value.answer,
    value.result
  ].flatMap((item) => collectRuntimeText(item, depth + 1));
}

export function normalizeGptOSRuntimeOutput(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (!isRuntimeRecord(value)) {
    return "";
  }

  const direct = collectRuntimeText(value).join("\n").trim();

  if (direct) {
    return direct;
  }

  const output = Array.isArray(value.output) ? value.output : [];
  const outputText = output.flatMap((item) => collectRuntimeText(item)).join("\n").trim();

  if (outputText) {
    return outputText;
  }

  const choices = Array.isArray(value.choices) ? value.choices : [];
  const choiceText = choices.flatMap((choice) => {
    if (!isRuntimeRecord(choice)) {
      return [];
    }

    return [
      isRuntimeRecord(choice.message) ? choice.message.content : undefined,
      isRuntimeRecord(choice.delta) ? choice.delta.content : undefined
    ].flatMap((item) => collectRuntimeText(item));
  }).join("\n").trim();

  return choiceText;
}

export function runAgent(execution: GptOSWorkflowExecution): GptOSAgentRuntime {
  const agent = execution.selectedAgent;

  // Agent Runtime 会真正改变动态 prompt、推理风格和输出契约，而不是只显示名称。
  return {
    agent,
    instruction: agent.promptModifier,
    reasoningStyle: agent.reasoningStyle,
    outputContract: agent.outputContract
  };
}

export function buildRuntimePrompt(
  execution: GptOSWorkflowExecution,
  agentRuntime: GptOSAgentRuntime,
  toolResults: GptOSToolResult[],
  decision?: GptOSAutonomousDecision
) {
  return [
    "你运行在 GPT OS 自治执行内核中。",
    `当前 Agent：${agentRuntime.agent.id} / ${agentRuntime.agent.role}`,
    `当前 Workflow：${execution.runtime.workflow.join(" -> ")}`,
    decision ? `自治决策：RAG=${decision.needsRag ? "yes" : "no"}; Tools=${decision.shouldUseTools ? "yes" : "no"}; MultiRound=${decision.needsMultiRoundReasoning ? "yes" : "no"}; Refine=${decision.shouldRefine ? "yes" : "no"}` : "",
    `Auto UX：mode=${execution.runtime.uxMode}; detected=${execution.runtime.detectedUxMode}; reason=${execution.runtime.uxReason}`,
    "UX 输出规则：SIMPLE=简洁自然回答；PRO=结构化解释并说明为什么这样回答；DEV=用人类可读步骤解释执行过程，但不要输出原始 diagnostics。",
    `收敛控制：maxLoop=${execution.runtime.maxLoopDepth}; maxTools=${execution.runtime.maxToolCalls}; confidence=${execution.runtime.confidence.toFixed(2)}; converged=${execution.runtime.converged ? "yes" : "no"}; stop=${execution.runtime.convergenceStopReason}`,
    `当前推理模式：${agentRuntime.reasoningStyle}`,
    `Agent 行为指令：${agentRuntime.instruction}`,
    `输出契约：${agentRuntime.outputContract}`,
    "工具执行结果：",
    toolResults.length
      ? toolResults.map((result) => `- loop${result.loopIndex} ${result.pluginName}: ${result.summary}; feedback=${result.feedbackToModel}`).join("\n")
      : "- 暂无工具结果",
    "请像执行型 AI 一样工作：先判断是否需要工具/RAG/多轮思考，再基于工具结果修正答案，保持 ChatGPT Pro 自然表达，不输出后台 JSON 或卡片化字段。"
  ].filter(Boolean).join("\n");
}

export function runToolExecutor(
  input: GptOSRuntimeInput,
  execution: GptOSWorkflowExecution,
  stage: "pre-model" | "post-model",
  modelText?: string,
  loopIndex = 1,
  budget?: { maxToolCalls: number; usedToolCalls: number }
) {
  return runGptOSToolExecutor({
    text: input.text,
    selectedAgentId: execution.selectedAgent.id,
    attachments: input.attachments,
    preferredPluginIds: execution.selectedAgent.preferredPluginIds,
    recentMessages: input.recentMessages,
    stage,
    loopIndex,
    modelText,
    budget
  });
}

export function autonomousDecisionLoop(
  input: GptOSRuntimeInput,
  execution: GptOSWorkflowExecution,
  agentRuntime: GptOSAgentRuntime
): GptOSAutonomousDecision {
  const text = input.text;
  const states = execution.runtime.decisionStates
    .map((state) => state as OSState)
    .filter((state): state is OSState => ["init", "analyze", "plan", "execute", "tool", "rethink", "loop", "final"].includes(state));
  const isFullAutonomy = execution.osMode === "FULL_AUTONOMY";
  const needsRag = states.includes("execute") || /知识|RAG|检索|入库|用户端|上下文/.test(text);
  const shouldUseTools = execution.decisionPolicy.toolPermission && (isFullAutonomy || states.includes("tool") || /工具|检查|总结|风险|格式|检索/.test(text));
  const needsMultiRoundReasoning = execution.runtime.reasoningDepth === "high" || /多轮|深度|复杂|系统|合规|风险|为什么|架构|方案/.test(text);
  const shouldRefine = states.includes("rethink") || states.includes("loop") || /优化|修正|润色|复核|检查/.test(text);
  const plannedToolLoopCount = shouldUseTools
    ? Math.max(1, Math.min(execution.decisionPolicy.maxLoopDepth, execution.runtime.toolLoopCount || (needsMultiRoundReasoning ? 2 : 1)))
    : 0;
  const plannedModelPasses = needsMultiRoundReasoning || shouldRefine
    ? Math.min(execution.decisionPolicy.maxLoopDepth, Math.max(1, execution.runtime.modelPasses))
    : 1;
  const toolLoopCount = isFullAutonomy && shouldUseTools ? Math.max(1, plannedToolLoopCount) : plannedToolLoopCount;
  const modelPasses = isFullAutonomy ? Math.max(2, plannedModelPasses) : plannedModelPasses;
  const maxSteps = Math.min(5, Math.max(isFullAutonomy ? 2 : 1, execution.decisionPolicy.maxLoopDepth, modelPasses));

  // 自治决策循环由 Agent 控制器和输入意图共同决定，避免固定 pipeline。
  return {
    states: states.length ? states : ["init", "analyze", "plan", "execute", "final"],
    needsRag,
    shouldUseTools,
    needsMultiRoundReasoning,
    shouldRefine,
    reasoningDepth: execution.runtime.reasoningDepth,
    toolLoopCount,
    modelPasses,
    maxSteps,
    replanEnabled: execution.decisionPolicy.replanEnabled,
    rationale: [
      `agent=${agentRuntime.agent.id}`,
      `mode=${execution.decisionPolicy.mode}`,
      `strategy=${execution.decisionPolicy.reasoningStrategy}`,
      `depth=${execution.decisionPolicy.reasoningDepth}`,
      `maxLoopDepth=${execution.decisionPolicy.maxLoopDepth}`,
      `hints=${execution.decisionPolicy.workflowHints.join(",")}`,
      `states=${states.join("->")}`
    ]
  };
}

function buildRefineInput(originalInput: string, previousModelText: string, toolResults: GptOSToolResult[], loopIndex = 2) {
  return [
    originalInput,
    "",
    `## GPT OS FULL 自治循环上下文 · Loop ${loopIndex}`,
    "你不是一次性回答模型。现在请根据上一轮输出和工具回流结果重新评估、必要时重规划，并只输出更准确、更自然、更安全的最终回答 JSON。",
    "",
    "上一轮回答摘要：",
    previousModelText.slice(0, 1800),
    "",
    "工具回流：",
    toolResults.map((result) => `- loop${result.loopIndex} ${result.pluginName}: ${result.feedbackToModel}; next=${result.nextAction}`).join("\n")
  ].join("\n");
}

function shouldReplanFromTools(toolResults: GptOSToolResult[]) {
  return toolResults.some((result) => result.nextAction === "replan");
}

function shouldFinalizeFromTools(toolResults: GptOSToolResult[]) {
  return toolResults.length > 0 && toolResults.every((result) => result.nextAction === "finalize");
}

function summarizeToolTrace(toolResults: GptOSToolResult[]): GptOSToolTraceEntry[] {
  return toolResults.map((result) => ({
    pluginId: result.pluginId,
    pluginName: result.pluginName,
    stage: result.stage,
    loopIndex: result.loopIndex,
    nextAction: result.nextAction,
    summary: result.summary
  }));
}

function buildWhyThisAnswer(
  execution: GptOSWorkflowExecution,
  decision: GptOSAutonomousDecision,
  toolResults: GptOSToolResult[],
  stopReason: string,
  finalConfidence: number
) {
  return [
    `Selected ${execution.selectedAgent.name} because matched signals were ${execution.matchedSignals.join(" / ") || "default routing"}.`,
    decision.needsRag
      ? "Used RAG/context-aware reasoning because the request references knowledge, files, or conversation context."
      : "Did not force extra retrieval because the current prompt and runtime context were sufficient.",
    toolResults.length
      ? `Used tools ${Array.from(new Set(toolResults.map((result) => result.pluginName))).join(" / ")} to verify, summarize, or format the response.`
      : "No tool call was required by the convergence controller.",
    `Stopped the loop because ${stopReason}; final confidence ${Math.round(finalConfidence * 100)}%.`
  ];
}

function updateExecutionRuntime(
  execution: GptOSWorkflowExecution,
  updates: Partial<GptOSWorkflowExecution["runtime"]>
): GptOSWorkflowExecution {
  return {
    ...execution,
    runtime: {
      ...execution.runtime,
      ...updates
    }
  };
}

export async function runAutonomyLoop<T>(
  input: GptOSRuntimeInput,
  handlers: GptOSPipelineHandlers<T>
): Promise<GptOSPipelineResult<T>> {
  const plannedExecution = planGptOSWorkflow({
    ...input,
    workflowState: "running"
  });
  const uxDecision = detectGptOSAutoUXMode(input.text);
  const agentRuntime = runAgent(plannedExecution);
  const decision = autonomousDecisionLoop(input, plannedExecution, agentRuntime);
  const convergenceBudget = getGptOSConvergenceBudget({
    maxLoopCount: Math.min(3, decision.maxSteps),
    maxToolCalls: 3,
    maxRetries: 2,
    confidenceThreshold: plannedExecution.decisionPolicy.convergenceThreshold,
    minLoopCount: plannedExecution.osMode === "FULL_AUTONOMY" ? 2 : 1
  });
  let execution = updateExecutionRuntime(plannedExecution, {
    toolLoopCount: decision.toolLoopCount,
    modelPasses: decision.modelPasses,
    reasoningDepth: decision.reasoningDepth,
    maxLoopDepth: decision.maxSteps,
    loopCount: 0,
    toolCalls: 0,
    replanCount: 0,
    confidence: plannedExecution.confidence,
    deltaImprovement: 1,
    converged: false,
    convergenceStopReason: "pending",
    costOptimized: true,
    maxToolCalls: convergenceBudget.maxToolCalls,
    maxRetries: convergenceBudget.maxRetries,
    prunedSteps: [],
    osLoopActive: plannedExecution.osMode === "FULL_AUTONOMY",
    toolTriggered: false,
    gptRecalled: false,
    autonomyValid: false,
    detectedUxMode: uxDecision.mode,
    uxReason: uxDecision.reason,
    uxSignals: uxDecision.matchedSignals,
    uxConfidence: uxDecision.confidence
  });
  const preToolResults = decision.shouldUseTools
    ? runToolExecutor(input, execution, "pre-model", undefined, 1, {
      maxToolCalls: Math.min(1, convergenceBudget.maxToolCalls),
      usedToolCalls: 0
    })
    : [];
  let allToolResults = [...preToolResults];
  let postToolResults: GptOSToolResult[] = [];
  let latestResult: T | null = null;
  let latestModelText = "";
  let currentModelInput = input.text;
  let replanCount = 0;
  let loopCount = 0;
  let modelCallCount = 0;
  const forcedMinimumLoops = plannedExecution.osMode === "FULL_AUTONOMY" ? 2 : 1;
  let previousModelText = "";
  let latestConvergence: GptOSConvergenceEvaluation | null = null;
  let reasoningTrace: GptOSSemanticTraceEntry[] = [
    {
      step: "analyze",
      reasoning: `Agent ${agentRuntime.agent.name} selected ${decision.reasoningDepth} reasoning with ${decision.maxSteps} max loop steps.`,
      toolUsed: [],
      decision: decision.rationale.join(" | ")
    },
    {
      step: "plan",
      reasoning: decision.needsMultiRoundReasoning
        ? "The request needs multi-round reasoning or refinement."
        : "The request can be handled with a compact execution plan.",
      toolUsed: execution.runtime.toolsUsed,
      decision: `RAG=${decision.needsRag ? "yes" : "no"}; tools=${decision.shouldUseTools ? "yes" : "no"}; refine=${decision.shouldRefine ? "yes" : "no"}`
    }
  ];

  execution = {
    ...execution,
    toolResults: allToolResults,
    plugins: execution.plugins.map((item) => ({ ...item, status: decision.shouldUseTools ? "completed" as const : item.status })),
    runtime: {
      ...execution.runtime,
      reasoningTrace,
      toolTrace: summarizeToolTrace(allToolResults)
    }
  };

  let index = 0;
  let continueLoop = true;

  while (continueLoop) {
    index += 1;
    loopCount = index;
    execution = updateExecutionRuntime(execution, {
      loopCount,
      toolCalls: allToolResults.length,
      replanCount,
      confidence: latestConvergence?.confidence ?? execution.runtime.confidence,
      deltaImprovement: latestConvergence?.deltaImprovement ?? execution.runtime.deltaImprovement,
      converged: latestConvergence?.converged ?? false,
      convergenceStopReason: latestConvergence?.stopReason ?? "running",
      costOptimized: latestConvergence?.costOptimized ?? true
    });
    const context: GptOSRuntimeContext = {
      execution,
      agentRuntime,
      decision,
      preToolResults,
      postToolResults,
      modelInput: currentModelInput,
      dynamicPrompt: buildRuntimePrompt(execution, agentRuntime, allToolResults, decision)
    };

    try {
      latestResult = await handlers.callModel(context);
      modelCallCount += 1;
    } catch (error) {
      modelCallCount += 1;

      if (!handlers.createFallbackResult) {
        throw error;
      }

      const safeError = normalizeGptOSError(error);
      const errorUX = buildGptOSErrorUX(error, {
        primaryProvider: "unknown",
        fallbackModel: "safe-fallback"
      });

      latestResult = await handlers.createFallbackResult(error, context);
      latestModelText = errorUX.recoveryMessage || safeError.message || GPT_OS_SAFE_FALLBACK_MESSAGE;
      latestConvergence = evaluateGptOSConvergence({
        previousModelText,
        latestModelText,
        routeConfidence: plannedExecution.confidence,
        loopCount: modelCallCount,
        toolCalls: allToolResults.length,
        retryCount: replanCount,
        toolResults: allToolResults,
        budget: convergenceBudget
      });
      reasoningTrace = [
        ...reasoningTrace,
        {
          step: `loop-${index}:fallback`,
          reasoning: errorUX.userMessage,
          toolUsed: allToolResults.map((result) => result.pluginId),
          decision: errorUX.diagnostics.join(" | ")
        }
      ];
      execution = updateExecutionRuntime({
        ...execution,
        toolResults: allToolResults
      }, {
        toolCalls: allToolResults.length,
        replanCount,
        confidence: latestConvergence.confidence,
        deltaImprovement: latestConvergence.deltaImprovement,
        converged: true,
        convergenceStopReason: "safe_fallback",
        costOptimized: true,
        fallbackUsed: true,
        errorHandled: true,
        fallbackModel: "safe-fallback",
        userFacingError: false,
        systemRecovered: true,
        toolTriggered: allToolResults.length > 0,
        gptRecalled: modelCallCount > 1,
        reasoningTrace,
        toolTrace: summarizeToolTrace(allToolResults)
      });
      continueLoop = false;
      continue;
    }
    let modelTextFromHandler = "";

    try {
      modelTextFromHandler = handlers.readModelText?.(latestResult) ?? "";
    } catch {
      modelTextFromHandler = "";
    }

    latestModelText = modelTextFromHandler || normalizeGptOSRuntimeOutput(latestResult) || latestModelText;

    const needsToolReview = /需要补充|不确定|无法|风险|合规|检查|复核|重新/.test(latestModelText);
    const remainingToolCalls = Math.max(0, convergenceBudget.maxToolCalls - allToolResults.length);
    const shouldRunToolThisRound = decision.shouldUseTools && (
      remainingToolCalls > 0 &&
      (
        index < forcedMinimumLoops ||
        (index <= Math.max(1, decision.toolLoopCount) && needsToolReview)
      )
    );
    const roundToolResults = shouldRunToolThisRound
      ? runToolExecutor(input, execution, "post-model", latestModelText, index, {
        maxToolCalls: Math.min(convergenceBudget.maxToolCalls, allToolResults.length + 1),
        usedToolCalls: allToolResults.length
      })
      : [];

    postToolResults = [...postToolResults, ...roundToolResults];
    allToolResults = [...allToolResults, ...roundToolResults];

    const shouldForceReplan = plannedExecution.osMode === "FULL_AUTONOMY" && decision.replanEnabled && index < forcedMinimumLoops;
    const shouldReplan = decision.replanEnabled && (shouldForceReplan || shouldReplanFromTools(roundToolResults));
    const shouldFinalize = shouldFinalizeFromTools(roundToolResults);

    if (shouldReplan) {
      replanCount += 1;
    }

    latestConvergence = evaluateGptOSConvergence({
      previousModelText,
      latestModelText,
      routeConfidence: plannedExecution.confidence,
      loopCount: modelCallCount,
      toolCalls: allToolResults.length,
      retryCount: replanCount,
      toolResults: allToolResults,
      budget: convergenceBudget
    });
    reasoningTrace = [
      ...reasoningTrace,
      {
        step: `loop-${index}:reasoning`,
        reasoning: latestModelText.slice(0, 220) || "Model returned a structured response for this loop.",
        toolUsed: roundToolResults.map((result) => result.pluginId),
        decision: shouldReplan
          ? "Tool feedback or forced autonomy required re-planning."
          : shouldFinalize
            ? "Tool feedback indicated the answer can finalize."
            : latestConvergence.shouldContinue
              ? `Continue because ${latestConvergence.stopReason}.`
              : `Stop because ${latestConvergence.stopReason}.`
      }
    ];

    execution = updateExecutionRuntime({
      ...execution,
      toolResults: allToolResults
    }, {
      toolCalls: allToolResults.length,
      replanCount,
      confidence: latestConvergence.confidence,
      deltaImprovement: latestConvergence.deltaImprovement,
      converged: latestConvergence.converged,
      convergenceStopReason: latestConvergence.stopReason,
      costOptimized: latestConvergence.costOptimized,
      toolTriggered: allToolResults.length > 0,
      gptRecalled: modelCallCount > 1,
      reasoningTrace,
      toolTrace: summarizeToolTrace(allToolResults)
    });

    const minimumLoopSatisfied = modelCallCount >= forcedMinimumLoops;
    const normalSatisfied = !shouldReplan && modelCallCount >= decision.modelPasses && index >= Math.max(1, decision.toolLoopCount);
    const controllerSatisfied = !latestConvergence.shouldContinue;
    const satisfied = (
      (minimumLoopSatisfied && (shouldFinalize || normalSatisfied || controllerSatisfied)) ||
      index >= Math.min(decision.maxSteps, convergenceBudget.maxLoopCount)
    );

    continueLoop = !satisfied;

    if (!continueLoop) {
      continue;
    }

    currentModelInput = buildRefineInput(input.text, latestModelText, allToolResults, index + 1);
    previousModelText = latestModelText;
  }

  if (!latestResult) {
    throw new Error("GPT OS 自治循环没有产生模型结果。");
  }

  const finalConvergence = latestConvergence ?? evaluateGptOSConvergence({
    previousModelText,
    latestModelText,
    routeConfidence: plannedExecution.confidence,
    loopCount: modelCallCount || loopCount,
    toolCalls: allToolResults.length,
    retryCount: replanCount,
    toolResults: allToolResults,
    budget: convergenceBudget
  });
  const modelPassesSatisfied = (modelCallCount || loopCount) >= decision.modelPasses;
  const converged = finalConvergence.converged || modelPassesSatisfied;
  const convergenceStopReason = finalConvergence.stopReason === "continue" && modelPassesSatisfied
    ? "model_passes_satisfied"
    : finalConvergence.stopReason;
  const prunedSteps = converged && (modelCallCount || loopCount) < Math.min(decision.maxSteps, convergenceBudget.maxLoopCount)
    ? execution.runtime.workflow.filter((state) => state === "rethink" || state === "loop")
    : [];
  const completedExecution = completeGptOSWorkflow(updateExecutionRuntime({
    ...execution,
    osMode: "AUTONOMOUS_CONVERGED"
  }, {
    loopCount: modelCallCount || loopCount,
    toolCalls: allToolResults.length,
    replanCount,
    modelPasses: modelCallCount || loopCount,
    confidence: finalConvergence.confidence,
    deltaImprovement: finalConvergence.deltaImprovement,
    converged,
    convergenceStopReason,
    costOptimized: finalConvergence.costOptimized,
    fallbackUsed: execution.runtime.fallbackUsed,
    errorHandled: execution.runtime.errorHandled,
    fallbackModel: execution.runtime.fallbackModel,
    userFacingError: false,
    systemRecovered: execution.runtime.systemRecovered || execution.runtime.errorHandled,
    prunedSteps,
    osLoopActive: true,
    toolTriggered: allToolResults.length > 0,
    gptRecalled: modelCallCount > 1,
    autonomyValid: modelCallCount > 1 && allToolResults.length > 0 && execution.runtime.workflow.length > 0,
    reasoningTrace,
    toolTrace: summarizeToolTrace(allToolResults),
    whyThisAnswer: buildWhyThisAnswer(execution, decision, allToolResults, convergenceStopReason, finalConvergence.confidence),
    semanticTraceEnabled: true
  }), allToolResults);
  const finalContext: GptOSRuntimeContext = {
    execution: completedExecution,
    agentRuntime,
    decision,
    preToolResults,
    postToolResults,
    modelInput: currentModelInput,
    dynamicPrompt: buildRuntimePrompt(completedExecution, agentRuntime, allToolResults, decision)
  };
  const refinedResult = handlers.refineResult
    ? await handlers.refineResult(latestResult, finalContext)
    : latestResult;

  // FULL_AUTONOMY 循环仍只通过注入的 callModel 回调访问现有 GPT/DeepSeek，不改底层调用。
  return {
    result: refinedResult,
    execution: completedExecution,
    context: finalContext
  };
}

export async function runWorkflow<T>(
  input: GptOSRuntimeInput,
  handlers: GptOSPipelineHandlers<T>
): Promise<GptOSPipelineResult<T>> {
  const plannedExecution = planGptOSWorkflow({
    ...input,
    workflowState: "running"
  });
  const agentRuntime = runAgent(plannedExecution);
  const decision = autonomousDecisionLoop(input, plannedExecution, agentRuntime);
  const preToolResults = decision.shouldUseTools
    ? runToolExecutor(input, plannedExecution, "pre-model", undefined, 1)
    : [];
  const executionForModel: GptOSWorkflowExecution = {
    ...plannedExecution,
    toolResults: preToolResults,
    plugins: plannedExecution.plugins.map((item) => ({ ...item, status: decision.shouldUseTools ? "completed" as const : item.status })),
    runtime: {
      ...plannedExecution.runtime,
      toolLoopCount: decision.toolLoopCount,
      modelPasses: decision.modelPasses,
      reasoningDepth: decision.reasoningDepth
    }
  };
  const dynamicPrompt = buildRuntimePrompt(executionForModel, agentRuntime, preToolResults, decision);
  const contextBeforeModel: GptOSRuntimeContext = {
    execution: executionForModel,
    agentRuntime,
    decision,
    preToolResults,
    postToolResults: [],
    modelInput: input.text,
    dynamicPrompt
  };
  const firstResult = await handlers.callModel(contextBeforeModel);
  const firstModelText = handlers.readModelText?.(firstResult) ?? "";
  const postToolResults = decision.toolLoopCount > 0
    ? runToolExecutor(input, executionForModel, "post-model", firstModelText, Math.max(1, decision.toolLoopCount))
    : [];
  const completedExecution = completeGptOSWorkflow(executionForModel, [
    ...preToolResults,
    ...postToolResults
  ]);
  const contextAfterTools: GptOSRuntimeContext = {
    ...contextBeforeModel,
    execution: completedExecution,
    postToolResults,
    dynamicPrompt: buildRuntimePrompt(completedExecution, agentRuntime, [
      ...preToolResults,
      ...postToolResults
    ], decision)
  };
  const rawResult = decision.modelPasses > 1
    ? await handlers.callModel({
      ...contextAfterTools,
      modelInput: buildRefineInput(input.text, firstModelText, postToolResults),
      dynamicPrompt: buildRuntimePrompt(completedExecution, agentRuntime, [
        ...preToolResults,
        ...postToolResults
      ], decision)
    })
    : firstResult;
  const finalContext = decision.modelPasses > 1
    ? {
      ...contextAfterTools,
      modelInput: buildRefineInput(input.text, firstModelText, postToolResults)
    }
    : contextAfterTools;
  const refinedResult = handlers.refineResult
    ? await handlers.refineResult(rawResult, finalContext)
    : rawResult;

  // 自治 OS 的唯一外部动作仍是调用传入的现有 GPT/DeepSeek 回调；工具本身保持纯函数闭环。
  return {
    result: refinedResult,
    execution: completedExecution,
    context: finalContext
  };
}

export async function executeOSPipeline<T>(
  input: GptOSRuntimeInput,
  handlers: GptOSPipelineHandlers<T>
): Promise<GptOSPipelineResult<T>> {
  return runWorkflow(input, handlers);
}

export async function executeAutonomousOS<T>(
  input: GptOSRuntimeInput,
  handlers: GptOSPipelineHandlers<T>
): Promise<GptOSPipelineResult<T>> {
  return runAutonomyLoop(input, handlers);
}
