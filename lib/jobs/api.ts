import { apiError, apiSuccess } from "@/lib/api-response";
import { UnauthorizedError } from "@/lib/errors";

export interface CronTaskResponse<T> {
  task: string;
  triggeredAt: string;
  result: T;
}

function authorizeCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new UnauthorizedError("后台任务密钥未配置，请在 Vercel 中设置 CRON_SECRET。");
    }

    return;
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${secret}`) {
    throw new UnauthorizedError("无权执行后台任务。");
  }
}

export async function runCronRoute<T>(
  request: Request,
  task: string,
  action: () => Promise<T>
) {
  try {
    authorizeCronRequest(request);

    return apiSuccess<CronTaskResponse<T>>({
      task,
      triggeredAt: new Date().toISOString(),
      result: await action()
    });
  } catch (error) {
    return apiError(error);
  }
}
