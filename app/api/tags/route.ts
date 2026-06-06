import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireKbAdmin } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface TagSummary {
  name: string;
  count: number;
}

interface TagsResponse {
  tags: TagSummary[];
  totalTags: number;
  totalAssignments: number;
}

interface TagMutationResponse extends TagsResponse {
  updatedItems: number;
}

type KnowledgeItemTags = {
  id: string;
  tags: string[];
};

function normalizeTag(value: unknown, fieldName = "标签") {
  const tag = typeof value === "string" ? value.trim() : "";

  if (!tag) {
    throw new ValidationError(`${fieldName}不能为空。`);
  }

  if (tag.length > 40) {
    throw new ValidationError(`${fieldName}不能超过 40 个字符。`);
  }

  return tag;
}

function uniqueTags(tags: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags.map((item) => item.trim()).filter(Boolean)) {
    if (seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    result.push(tag);
  }

  return result;
}

function summarizeTags(items: KnowledgeItemTags[]): TagsResponse {
  const counts = new Map<string, number>();

  for (const item of items) {
    for (const tag of Array.from(new Set(item.tags.map((value) => value.trim()).filter(Boolean)))) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const tags = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN"));

  return {
    tags,
    totalTags: tags.length,
    totalAssignments: tags.reduce((total, tag) => total + tag.count, 0)
  };
}

async function listUserTagItems(userId: string) {
  return prisma.knowledgeItem.findMany({
    where: { userId, deletedAt: null },
    select: {
      id: true,
      tags: true
    }
  });
}

async function getTagsResponse(userId: string): Promise<TagsResponse> {
  return summarizeTags(await listUserTagItems(userId));
}

async function updateItemTags(items: KnowledgeItemTags[], transform: (tags: string[]) => string[]) {
  const updates = items
    .map((item) => ({
      id: item.id,
      tags: uniqueTags(transform(item.tags))
    }))
    .filter((item, index) => item.tags.join("\u0000") !== items[index].tags.join("\u0000"));

  if (updates.length === 0) {
    return 0;
  }

  await prisma.$transaction(
    updates.map((item) =>
      prisma.knowledgeItem.update({
        where: { id: item.id },
        data: { tags: item.tags },
        select: { id: true }
      })
    )
  );

  return updates.length;
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("请求体必须是合法 JSON。");
  }
}

async function getAuthUserOrResponse() {
  try {
    return await requireKbAdmin(undefined, {
      targetType: "knowledge_tag"
    });
  } catch (error) {
    throw error;
  }
}

export async function GET() {
  let currentUser: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    currentUser = await getAuthUserOrResponse();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("加载标签"));
  }

  try {
    return apiSuccess<TagsResponse>(await getTagsResponse(currentUser.id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  let currentUser: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    currentUser = await getAuthUserOrResponse();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("重命名标签"));
  }

  try {
    const body = await parseJsonBody(request);

    if (!isPlainObject(body)) {
      throw new ValidationError("请求体必须是 JSON 对象。");
    }

    const from = normalizeTag(body.from, "原标签");
    const to = normalizeTag(body.to, "新标签");

    if (from === to) {
      throw new ValidationError("新标签不能和原标签相同。");
    }

    const items = await prisma.knowledgeItem.findMany({
      where: {
        userId: currentUser.id,
        tags: { has: from },
        deletedAt: null
      },
      select: {
        id: true,
        tags: true
      }
    });
    const updatedItems = await updateItemTags(items, (tags) => tags.map((tag) => (tag === from ? to : tag)));
    const tagsResponse = await getTagsResponse(currentUser.id);

    return apiSuccess<TagMutationResponse>({
      ...tagsResponse,
      updatedItems
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  let currentUser: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    currentUser = await getAuthUserOrResponse();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("删除标签"));
  }

  try {
    const { searchParams } = new URL(request.url);
    let tag = searchParams.get("tag")?.trim() ?? "";

    if (!tag) {
      const body = await parseJsonBody(request);

      if (!isPlainObject(body)) {
        throw new ValidationError("请求体必须是 JSON 对象。");
      }

      tag = normalizeTag(body.tag);
    }

    const items = await prisma.knowledgeItem.findMany({
      where: {
        userId: currentUser.id,
        tags: { has: tag },
        deletedAt: null
      },
      select: {
        id: true,
        tags: true
      }
    });
    const updatedItems = await updateItemTags(items, (tags) => tags.filter((item) => item !== tag));
    const tagsResponse = await getTagsResponse(currentUser.id);

    return apiSuccess<TagMutationResponse>({
      ...tagsResponse,
      updatedItems
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  let currentUser: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    currentUser = await getAuthUserOrResponse();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("合并标签"));
  }

  try {
    const body = await parseJsonBody(request);

    if (!isPlainObject(body)) {
      throw new ValidationError("请求体必须是 JSON 对象。");
    }

    const rawSourceTags = Array.isArray(body.sourceTags) ? body.sourceTags : [body.from];
    const sourceTags = uniqueTags(rawSourceTags.map((tag) => normalizeTag(tag, "待合并标签")));
    const targetTag = normalizeTag(body.targetTag ?? body.to, "目标标签");

    if (sourceTags.length === 0) {
      throw new ValidationError("请选择要合并的标签。");
    }

    if (sourceTags.includes(targetTag)) {
      throw new ValidationError("目标标签不能同时作为待合并标签。");
    }

    const sourceTagSet = new Set(sourceTags);
    const items = await prisma.knowledgeItem.findMany({
      where: {
        userId: currentUser.id,
        tags: { hasSome: sourceTags },
        deletedAt: null
      },
      select: {
        id: true,
        tags: true
      }
    });
    const updatedItems = await updateItemTags(items, (tags) => [
      ...tags.filter((tag) => !sourceTagSet.has(tag)),
      targetTag
    ]);
    const tagsResponse = await getTagsResponse(currentUser.id);

    return apiSuccess<TagMutationResponse>({
      ...tagsResponse,
      updatedItems
    });
  } catch (error) {
    return apiError(error);
  }
}
