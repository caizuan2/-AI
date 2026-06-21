import type { GptOSAgentId } from "@/lib/enterprise/gpt-os-agent-router";

export type GptOSPluginId =
  | "knowledge-search"
  | "summary-tool"
  | "risk-check"
  | "formatting-tool";

export interface GptOSPluginDefinition {
  id: GptOSPluginId;
  name: string;
  description: string;
  pureFunctionOnly: true;
}

export interface GptOSPluginSelectionInput {
  text: string;
  selectedAgentId: GptOSAgentId;
  attachments?: Array<{ fileName?: string; parseStatus?: string }>;
  preferredPluginIds?: GptOSPluginId[];
}

export interface GptOSPluginCall {
  plugin: GptOSPluginDefinition;
  status: "planned" | "completed";
  reason: string;
}

export interface GptOSToolExecutorInput extends GptOSPluginSelectionInput {
  stage: "pre-model" | "post-model";
  loopIndex?: number;
  modelText?: string;
  recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  budget?: {
    maxToolCalls: number;
    usedToolCalls: number;
  };
}

export interface GptOSToolResult {
  pluginId: GptOSPluginId;
  pluginName: string;
  stage: "pre-model" | "post-model";
  loopIndex: number;
  summary: string;
  feedbackToModel: string;
  nextAction: "continue" | "replan" | "finalize";
  data: Record<string, unknown>;
}

export const GPT_OS_PLUGINS: GptOSPluginDefinition[] = [
  {
    id: "knowledge-search",
    name: "Knowledge Search",
    description: "在已有知识上下文中定位可复用片段，供 RAG 和回答合成使用。",
    pureFunctionOnly: true
  },
  {
    id: "summary-tool",
    name: "Summary Tool",
    description: "把输入、附件和上下文压缩成可继续推理的摘要。",
    pureFunctionOnly: true
  },
  {
    id: "risk-check",
    name: "Risk Check",
    description: "识别合规、承诺、证据不足和高风险表达。",
    pureFunctionOnly: true
  },
  {
    id: "formatting-tool",
    name: "Formatting Tool",
    description: "把输出整理成 ChatGPT Pro 风格的自然 Markdown。",
    pureFunctionOnly: true
  }
];

const pluginById = new Map(GPT_OS_PLUGINS.map((plugin) => [plugin.id, plugin]));

function call(id: GptOSPluginId, reason: string): GptOSPluginCall {
  const plugin = pluginById.get(id);

  if (!plugin) {
    throw new Error(`Unknown GPT OS plugin: ${id}`);
  }

  return {
    plugin,
    status: "planned",
    reason
  };
}

export function selectGptOSPlugins(input: GptOSPluginSelectionInput): GptOSPluginCall[] {
  const calls: GptOSPluginCall[] = [];
  const text = input.text;
  const preferredPluginIds = input.preferredPluginIds ?? [];

  if (preferredPluginIds.includes("knowledge-search") || /知识|RAG|检索|入库|调用|用户端/.test(text)) {
    calls.push(call("knowledge-search", "问题涉及知识库检索、入库或用户端调用。"));
  }

  if (preferredPluginIds.includes("summary-tool") || input.attachments?.length || /总结|提炼|学习|归纳|拆解/.test(text)) {
    calls.push(call("summary-tool", "需要先压缩资料、附件或上下文再回答。"));
  }

  if (preferredPluginIds.includes("risk-check") || input.selectedAgentId === "compliance-agent" || /风险|合规|法律|医疗|财务|承诺|夸大|审核/.test(text)) {
    calls.push(call("risk-check", "存在合规或风险审查意图。"));
  }

  if (!calls.some((item) => item.plugin.id === "formatting-tool")) {
    calls.push(call("formatting-tool", "统一输出为自然、可读、不过度模板化的 ChatGPT 风格。"));
  }

  // 插件注册表只返回纯函数计划，不触碰外部系统、数据库或第三方 API。
  return calls;
}

function uniqueKeywords(text: string) {
  const candidates = text
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]+/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  return Array.from(new Set(candidates)).slice(0, 8);
}

function compactText(text: string, limit = 220) {
  const normalized = text.replace(/\s+/g, " ").trim();

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

export function runGptOSPlugin(pluginId: GptOSPluginId, input: GptOSToolExecutorInput): GptOSToolResult {
  const plugin = pluginById.get(pluginId);

  if (!plugin) {
    throw new Error(`Unknown GPT OS plugin: ${pluginId}`);
  }

  if (pluginId === "knowledge-search") {
    const keywords = uniqueKeywords(input.text);
    const messageHits = (input.recentMessages ?? [])
      .filter((message) => keywords.some((keyword) => message.content.includes(keyword)))
      .slice(-3)
      .map((message) => compactText(message.content, 120));

    return {
      pluginId,
      pluginName: plugin.name,
      stage: input.stage,
      loopIndex: input.loopIndex ?? 1,
      summary: messageHits.length
        ? `找到 ${messageHits.length} 条最近上下文可作为知识检索线索。`
        : "未命中明确历史上下文，使用当前输入作为主要知识线索。",
      feedbackToModel: messageHits.length
        ? `请结合这些最近上下文线索回答：${messageHits.join(" / ")}`
        : `请把当前输入作为主要知识检索线索，关键词：${keywords.join("、")}`,
      nextAction: messageHits.length ? "continue" : "replan",
      data: {
        keywords,
        messageHits
      }
    };
  }

  if (pluginId === "summary-tool") {
    const attachmentNames = (input.attachments ?? []).map((attachment) => attachment.fileName).filter(Boolean);

    return {
      pluginId,
      pluginName: plugin.name,
      stage: input.stage,
      loopIndex: input.loopIndex ?? 1,
      summary: attachmentNames.length
        ? `已压缩当前输入，并纳入附件：${attachmentNames.join("、")}。`
        : `已压缩当前输入：${compactText(input.modelText || input.text, 180)}`,
      feedbackToModel: attachmentNames.length
        ? `请把附件 ${attachmentNames.join("、")} 与压缩输入一起作为下一轮推理上下文。`
        : `请基于压缩内容继续推理：${compactText(input.modelText || input.text, 180)}`,
      nextAction: "continue",
      data: {
        compactInput: compactText(input.text),
        attachmentNames
      }
    };
  }

  if (pluginId === "risk-check") {
    const riskSignals = ["承诺", "保证", "治愈", "最", "唯一", "法律", "医疗", "财务", "风险", "合规"]
      .filter((signal) => (input.modelText || input.text).includes(signal));

    return {
      pluginId,
      pluginName: plugin.name,
      stage: input.stage,
      loopIndex: input.loopIndex ?? 1,
      summary: riskSignals.length
        ? `检测到风险信号：${riskSignals.join("、")}，回答需要保留安全边界。`
        : "未检测到明显高风险承诺，但仍需避免夸大和替代专业建议。",
      feedbackToModel: riskSignals.length
        ? `下一轮回答必须规避或弱化这些风险表达：${riskSignals.join("、")}。`
        : "下一轮回答仍需保持安全边界，不要给绝对化承诺。",
      nextAction: riskSignals.length >= 2 ? "replan" : "continue",
      data: {
        riskSignals,
        riskLevel: riskSignals.length >= 3 ? "high" : riskSignals.length > 0 ? "medium" : "low"
      }
    };
  }

  return {
    pluginId,
    pluginName: plugin.name,
    stage: input.stage,
    loopIndex: input.loopIndex ?? 1,
    summary: "建议用自然 Markdown 合成最终回复，避免固定后台模板和卡片化输出。",
    feedbackToModel: "下一轮输出请保持自然 Markdown，不展示后台字段、JSON 或固定知识卡片。",
    nextAction: "finalize",
    data: {
      style: "chatgpt-pro-natural-markdown",
      avoid: ["fixed-template", "raw-json", "admin-field-list"]
    }
  };
}

export function runGptOSToolExecutor(input: GptOSToolExecutorInput): GptOSToolResult[] {
  const calls = selectGptOSPlugins(input);
  const maxToolCalls = input.budget?.maxToolCalls ?? calls.length;
  const usedToolCalls = input.budget?.usedToolCalls ?? 0;
  const remainingToolCalls = Math.max(0, maxToolCalls - usedToolCalls);

  if (remainingToolCalls <= 0) {
    return [];
  }

  // Tool Executor 真正执行纯函数工具，并把结果交给 GPT OS prompt 或 post processor。
  return calls.slice(0, remainingToolCalls).map((item) => runGptOSPlugin(item.plugin.id, input));
}
