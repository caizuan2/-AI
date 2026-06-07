import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireKbAdmin } from "@/lib/auth/guards";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  parseQuickActionInput,
  serializeAdminQuickAction,
  type QuickActionCategoryRecord,
  type QuickActionCategoryView
} from "@/lib/quick-actions";
import { hasDatabaseUrl } from "@/lib/server-config";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

interface AdminQuickActionsResponse {
  quickActions: QuickActionCategoryView[];
}

interface AdminQuickActionMutationResponse {
  quickAction: QuickActionCategoryView;
}

interface AdminQuickActionDeleteResponse {
  deleted: true;
  id: string;
}

async function parseBody(request: Request) {
  try {
    const body = await request.json();

    if (!isPlainObject(body)) {
      throw new ValidationError("请求体必须是 JSON 对象。");
    }

    return body;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new ValidationError("请求体必须是合法 JSON。");
  }
}

async function ensureAdmin(request: Request) {
  return requireKbAdmin(request, {
    deniedAction: "RBAC_ACCESS_DENIED",
    targetType: "quick_action_category"
  });
}

function assertDatabaseReady(action: string) {
  if (!hasDatabaseUrl()) {
    return databaseConfigError(action);
  }

  return null;
}

async function findQuickActionOrThrow(id: string) {
  const [quickAction] = await prisma.$queryRaw<QuickActionCategoryRecord[]>`
    SELECT id, name, description, icon, type, action, prompt, enabled, "sortOrder", "createdAt", "updatedAt"
    FROM "quick_action_categories"
    WHERE id = ${id}
    LIMIT 1
  `;

  if (!quickAction) {
    throw new NotFoundError("快捷分类不存在。");
  }

  return quickAction;
}

async function findQuickActionByName(name: string) {
  const [quickAction] = await prisma.$queryRaw<QuickActionCategoryRecord[]>`
    SELECT id, name, description, icon, type, action, prompt, enabled, "sortOrder", "createdAt", "updatedAt"
    FROM "quick_action_categories"
    WHERE name = ${name}
    LIMIT 1
  `;

  return quickAction ?? null;
}

function createQuickActionId() {
  return `quick_${randomUUID().replace(/-/g, "")}`;
}

export async function GET(request: Request) {
  try {
    await ensureAdmin(request);

    const configError = assertDatabaseReady("读取快捷分类");

    if (configError) {
      return apiError(configError);
    }

    const quickActions = await prisma.$queryRaw<QuickActionCategoryRecord[]>`
      SELECT id, name, description, icon, type, action, prompt, enabled, "sortOrder", "createdAt", "updatedAt"
      FROM "quick_action_categories"
      ORDER BY "sortOrder" ASC, "createdAt" ASC
    `;

    return apiSuccess<AdminQuickActionsResponse>({
      quickActions: quickActions.map(serializeAdminQuickAction)
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureAdmin(request);

    const configError = assertDatabaseReady("新增快捷分类");

    if (configError) {
      return apiError(configError);
    }

    const body = await parseBody(request);
    const input = parseQuickActionInput(body);
    const existing = await findQuickActionByName(input.name);

    if (existing) {
      throw new ValidationError(`快捷分类「${input.name}」已存在。`);
    }

    const [quickAction] = await prisma.$queryRaw<QuickActionCategoryRecord[]>`
      INSERT INTO "quick_action_categories"
        (id, name, description, icon, type, action, prompt, enabled, "sortOrder", "createdAt", "updatedAt")
      VALUES
        (${createQuickActionId()}, ${input.name}, ${input.description}, ${input.icon}, ${input.type}, ${input.action}, ${input.prompt}, ${input.enabled}, ${input.sortOrder}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, name, description, icon, type, action, prompt, enabled, "sortOrder", "createdAt", "updatedAt"
    `;

    return apiSuccess<AdminQuickActionMutationResponse>({
      quickAction: serializeAdminQuickAction(quickAction)
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureAdmin(request);

    const configError = assertDatabaseReady("更新快捷分类");

    if (configError) {
      return apiError(configError);
    }

    const body = await parseBody(request);
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      throw new ValidationError("快捷分类 id 不能为空。");
    }

    const existing = await findQuickActionOrThrow(id);
    const input = parseQuickActionInput(body, {
      name: existing.name,
      description: existing.description,
      icon: existing.icon,
      type: existing.type,
      action: existing.action,
      prompt: existing.prompt,
      enabled: existing.enabled,
      sortOrder: existing.sortOrder
    });
    const duplicate = input.name === existing.name ? null : await findQuickActionByName(input.name);

    if (duplicate) {
      throw new ValidationError(`快捷分类「${input.name}」已存在。`);
    }

    const [quickAction] = await prisma.$queryRaw<QuickActionCategoryRecord[]>`
      UPDATE "quick_action_categories"
      SET
        name = ${input.name},
        description = ${input.description},
        icon = ${input.icon},
        type = ${input.type},
        action = ${input.action},
        prompt = ${input.prompt},
        enabled = ${input.enabled},
        "sortOrder" = ${input.sortOrder},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, description, icon, type, action, prompt, enabled, "sortOrder", "createdAt", "updatedAt"
    `;

    return apiSuccess<AdminQuickActionMutationResponse>({
      quickAction: serializeAdminQuickAction(quickAction)
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureAdmin(request);

    const configError = assertDatabaseReady("删除快捷分类");

    if (configError) {
      return apiError(configError);
    }

    const { searchParams } = new URL(request.url);
    const body = request.headers.get("content-type")?.includes("application/json")
      ? await parseBody(request)
      : {};
    const id = (searchParams.get("id") ?? (typeof body.id === "string" ? body.id : "")).trim();

    if (!id) {
      throw new ValidationError("快捷分类 id 不能为空。");
    }

    await findQuickActionOrThrow(id);
    await prisma.$executeRaw`
      DELETE FROM "quick_action_categories"
      WHERE id = ${id}
    `;

    return apiSuccess<AdminQuickActionDeleteResponse>({
      deleted: true,
      id
    });
  } catch (error) {
    return apiError(error);
  }
}
