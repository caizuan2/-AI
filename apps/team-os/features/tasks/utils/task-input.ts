import { isPlainObject } from "@/lib/api/responses";
import { ValidationError } from "@/lib/errors";
import type { CreateTaskInput, SubmitTaskInput, TaskListScope } from "@/apps/team-os/features/tasks/types";

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${label}不能为空。`);
  }

  const result = value.trim();
  if (result.length > maxLength) {
    throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  }

  return result;
}

function stringList(value: unknown, label: string) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ValidationError(`${label}格式不正确。`);
  }

  const values = value.map((item) => item.trim()).filter(Boolean);
  if (values.length > 10 || values.some((item) => item.length > 1000)) {
    throw new ValidationError(`${label}最多包含 10 个有效地址。`);
  }

  if (values.some((item) => {
    if (item.startsWith("/")) {
      return item.startsWith("//");
    }

    try {
      const url = new URL(item);
      return url.protocol !== "https:" && url.protocol !== "http:";
    } catch {
      return true;
    }
  })) {
    throw new ValidationError(`${label}只能使用 HTTP、HTTPS 或站内相对地址。`);
  }

  return values;
}

export function parseTaskListScope(value: string | null): TaskListScope {
  return value === "my" ? "my" : "management";
}

export function parseCreateTaskInput(body: unknown): CreateTaskInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const deadlineValue = requiredText(body.deadline, "截止时间", 80);
  const deadline = new Date(deadlineValue);
  if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
    throw new ValidationError("截止时间必须晚于当前时间。");
  }

  const targetCount = typeof body.targetCount === "number" ? body.targetCount : Number.NaN;
  if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > 10000) {
    throw new ValidationError("目标数量必须是 1 到 10000 之间的整数。");
  }

  return {
    title: requiredText(body.title, "任务名称", 120),
    description: requiredText(body.description, "任务描述", 5000),
    teamId: requiredText(body.teamId, "执行团队", 120),
    deadline: deadline.toISOString(),
    targetCount,
    submissionRequirements: requiredText(body.submissionRequirements, "提交要求", 2000)
  };
}

export function parseSubmitTaskInput(body: unknown): SubmitTaskInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  const images = stringList(body.images, "图片");
  const attachments = stringList(body.attachments, "附件");

  if (!content && images.length === 0 && attachments.length === 0) {
    throw new ValidationError("请填写聊天记录或提供图片、附件证据。");
  }

  if (content.length > 20000) {
    throw new ValidationError("聊天记录不能超过 20000 个字符。");
  }

  return {
    content,
    images,
    attachments,
    summary: requiredText(body.summary, "任务总结", 5000)
  };
}
