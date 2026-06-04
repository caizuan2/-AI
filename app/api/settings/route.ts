import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireLicensedUser } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  getOrCreateUserSettings,
  isSaveStrategy,
  updateUserSettings,
  type UserSettingsResponse
} from "@/lib/settings";

export const dynamic = "force-dynamic";

function parseSettingsPatch(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  if (!isSaveStrategy(body.saveStrategy)) {
    throw new ValidationError("知识保存策略不正确。");
  }

  const defaultExpireDays = typeof body.defaultExpireDays === "number"
    ? Math.round(body.defaultExpireDays)
    : Number.NaN;
  const preferredProvider = body.preferredProvider === "openai" || body.preferredProvider === "deepseek"
    ? body.preferredProvider
    : null;
  const preferredModel = typeof body.preferredModel === "string" && body.preferredModel.trim()
    ? body.preferredModel.trim().slice(0, 80)
    : null;
  const ragTopK = typeof body.ragTopK === "number" ? Math.round(body.ragTopK) : null;
  const ragMinScore = typeof body.ragMinScore === "number" ? body.ragMinScore : null;

  if (!Number.isInteger(defaultExpireDays) || defaultExpireDays < 1 || defaultExpireDays > 3650) {
    throw new ValidationError("默认过期提醒周期必须是 1 到 3650 天。");
  }

  return {
    saveStrategy: body.saveStrategy,
    defaultExpireDays,
    preferredProvider,
    preferredModel,
    ragTopK: ragTopK !== null && ragTopK >= 1 && ragTopK <= 20 ? ragTopK : null,
    ragMinScore: ragMinScore !== null && ragMinScore >= 0 && ragMinScore <= 1 ? ragMinScore : null
  };
}

export async function GET() {
  let user: Awaited<ReturnType<typeof requireLicensedUser>>;

  try {
    user = await requireLicensedUser();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("加载设置"));
  }

  try {
    return apiSuccess<UserSettingsResponse>(await getOrCreateUserSettings(user.id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  let user: Awaited<ReturnType<typeof requireLicensedUser>>;

  try {
    user = await requireLicensedUser();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("保存设置"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: ReturnType<typeof parseSettingsPatch>;

  try {
    input = parseSettingsPatch(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    return apiSuccess<UserSettingsResponse>(await updateUserSettings(user.id, input));
  } catch (error) {
    return apiError(error);
  }
}
