import "server-only";

import { NextResponse } from "next/server";
import { apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireUserAppAccess } from "@/lib/auth/guards";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  createTaskForManager,
  listTasksForUser,
  submitTaskEvidence
} from "@/apps/team-os/features/tasks/services/task-repository";
import {
  parseCreateTaskInput,
  parseSubmitTaskInput,
  parseTaskListScope
} from "@/apps/team-os/features/tasks/utils/task-input";
import { createTeamOsApiErrorHandler } from "@/apps/team-os/features/production/services/error-handler";
import { readTeamOsJson as readJson } from "@/apps/team-os/features/production/services/production-http";

const apiError = createTeamOsApiErrorHandler("TASKS");

export async function handleTaskList(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取团队任务"));
    }

    const scope = parseTaskListScope(new URL(request.url).searchParams.get("scope"));
    return apiSuccess(await listTasksForUser(user.id, scope));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTaskCreate(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("创建团队任务"));
    }

    const input = parseCreateTaskInput(await readJson(request));
    return apiSuccess({ task: await createTaskForManager(user.id, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTaskSubmit(request: Request, taskId: string) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("提交任务证据"));
    }

    const input = parseSubmitTaskInput(await readJson(request));
    const submission = await submitTaskEvidence(user.id, taskId, input);

    return NextResponse.json(
      {
        ok: true,
        success: true,
        submissionId: submission.id
      },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
