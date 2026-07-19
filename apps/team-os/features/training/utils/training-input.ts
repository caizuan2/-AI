import { isPlainObject } from "@/lib/api/responses";
import { ValidationError } from "@/lib/errors";
import {
  TRAINING_COURSE_CATEGORIES,
  TRAINING_COURSE_LEVELS,
  TRAINING_COURSE_STATUSES,
  type CreateTrainingAssignmentInput,
  type EvaluateTrainingInput,
  type TrainingCourseCategory,
  type TrainingCourseLevel,
  type TrainingCourseListFilters,
  type TrainingCourseStatus,
  type UpdateTrainingRecordInput,
  type UpsertTrainingCourseInput
} from "@/apps/team-os/features/training/types";

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

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ValidationError(`${label}格式不正确。`);
  }
  const result = value.trim();
  if (!result) return undefined;
  if (result.length > maxLength) {
    throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  }
  return result;
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new ValidationError(`${label}不正确。`);
  }
  return value as T;
}

function optionalEnumValue<T extends string>(
  value: string | null,
  values: readonly T[],
  label: string
) {
  if (!value) return undefined;
  return enumValue(value, values, label);
}

export function parseTrainingCourseFilters(searchParams: URLSearchParams): TrainingCourseListFilters {
  return {
    companyId: optionalText(searchParams.get("companyId"), "企业 ID", 120),
    search: optionalText(searchParams.get("q"), "搜索内容", 100),
    category: optionalEnumValue<TrainingCourseCategory>(
      searchParams.get("category"),
      TRAINING_COURSE_CATEGORIES,
      "课程分类"
    ),
    level: optionalEnumValue<TrainingCourseLevel>(
      searchParams.get("level"),
      TRAINING_COURSE_LEVELS,
      "课程等级"
    ),
    status: optionalEnumValue<TrainingCourseStatus>(
      searchParams.get("status"),
      TRAINING_COURSE_STATUSES,
      "课程状态"
    )
  };
}

export function parseUpsertTrainingCourseInput(body: unknown): UpsertTrainingCourseInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }
  const generateFromKnowledge = body.generateFromKnowledge === true;
  const content = optionalText(body.content, "课程内容", 30_000);
  if (!generateFromKnowledge && !content) {
    throw new ValidationError("手动创建课程时课程内容不能为空。");
  }

  return {
    companyId: requiredText(body.companyId, "企业 ID", 120),
    courseId: optionalText(body.courseId, "课程 ID", 120),
    title: requiredText(body.title, "课程标题", 160),
    description: optionalText(body.description, "课程简介", 3_000),
    category: enumValue(body.category, TRAINING_COURSE_CATEGORIES, "课程分类"),
    content,
    level: enumValue(body.level, TRAINING_COURSE_LEVELS, "课程等级"),
    status: enumValue(body.status, TRAINING_COURSE_STATUSES, "课程状态"),
    generateFromKnowledge
  };
}

export function parseUpdateTrainingRecordInput(body: unknown): UpdateTrainingRecordInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }
  if (body.action !== "START") {
    throw new ValidationError("学习记录操作不正确。");
  }
  return {
    courseId: requiredText(body.courseId, "课程 ID", 120),
    action: "START"
  };
}

export function parseCreateTrainingAssignmentInput(body: unknown): CreateTrainingAssignmentInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }
  const rawDeadline = requiredText(body.deadline, "培训截止时间", 80);
  const deadline = new Date(rawDeadline);
  if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) {
    throw new ValidationError("培训截止时间必须是未来的有效时间。");
  }
  return {
    courseId: requiredText(body.courseId, "课程 ID", 120),
    teamId: requiredText(body.teamId, "所属团队", 120),
    userId: requiredText(body.userId, "员工 ID", 120),
    deadline: deadline.toISOString()
  };
}

export function parseEvaluateTrainingInput(body: unknown): EvaluateTrainingInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }
  return {
    courseId: requiredText(body.courseId, "课程 ID", 120),
    question: requiredText(body.question, "模拟问题", 4_000),
    answer: requiredText(body.answer, "员工回答", 20_000),
    scenarioToken: requiredText(body.scenarioToken, "训练场景凭证", 50_000)
  };
}

export function parseTrainingCourseSelectionInput(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }
  return { courseId: requiredText(body.courseId, "课程 ID", 120) };
}

export function parseTrainingCompanyId(searchParams: URLSearchParams) {
  return optionalText(searchParams.get("companyId"), "企业 ID", 120);
}

export function parseTrainingCourseId(searchParams: URLSearchParams) {
  return requiredText(searchParams.get("courseId"), "课程 ID", 120);
}
