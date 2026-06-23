export type AutonomousActionRisk = "safe" | "review_required" | "dangerous";

export interface AutonomousActionLike {
  id?: string;
  label?: string;
  title?: string;
  description?: string;
  type?: string;
  actionType?: string;
}

function normalizeActionText(action: AutonomousActionLike | string) {
  if (typeof action === "string") {
    return action.toLowerCase();
  }

  return [
    action.id,
    action.label,
    action.title,
    action.description,
    action.type,
    action.actionType
  ].filter(Boolean).join(" ").toLowerCase();
}

export function classifyActionRisk(action: AutonomousActionLike | string): AutonomousActionRisk {
  const text = normalizeActionText(action);

  if (/删除|清空|destroy|delete|remove|drop\s+table|truncate|prisma|migration|schema|数据库结构|执行命令|系统命令|powershell|cmd|terminal|git\s+|commit|push|reset|restore|clean|stash|api\s*key|apikey|secret|密钥|发布到外部|发送邮件|发送消息|外部发送|webhook/i.test(text)) {
    return "dangerous";
  }

  if (/保存.*入库|入库保存|写入|持久化|覆盖|批量生成|批量入库|导出文件|文件导出|导出到|发布|可发布|修改.*agent|agent.*配置|save\b|export\b|download\b|publish\b/i.test(text)) {
    return "review_required";
  }

  return "safe";
}

export function requiresHumanApproval(action: AutonomousActionLike | string) {
  return classifyActionRisk(action) === "review_required";
}

export function isDangerousAction(action: AutonomousActionLike | string) {
  return classifyActionRisk(action) === "dangerous";
}

export function getSafeUserMessage(action: AutonomousActionLike | string) {
  const risk = classifyActionRisk(action);
  const label = typeof action === "string" ? action : action.label ?? action.title ?? action.description ?? "当前动作";

  if (risk === "dangerous") {
    return `“${label}”属于高风险动作，GPT OS 已阻断，必须由管理员人工处理。`;
  }

  if (risk === "review_required") {
    return `“${label}”需要人工确认后才能继续，GPT OS 不会自动写入、保存、导出或发布。`;
  }

  return `“${label}”属于低风险分析/草稿动作，可由 GPT OS 自动执行。`;
}
