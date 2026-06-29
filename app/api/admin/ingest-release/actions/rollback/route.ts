import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { appendReleaseAuditRecord } from "@/lib/enterprise/release-audit-log";
import { dispatchWorkflow, getGithubActionsState } from "@/lib/enterprise/release-github-actions-client";
import { buildReleasePermissions, buildRollbackPlan } from "@/lib/enterprise/release-console-service";
import { git, resolveReleaseEnvironment } from "@/lib/enterprise/release-manifest-reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readRollbackRef(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_release_rollback"
    });
    const permissions = buildReleasePermissions(actor);

    if (!permissions.canRollback) {
      return NextResponse.json({
        ok: false,
        success: false,
        error: {
          code: "RELEASE_ROLLBACK_FORBIDDEN",
          message: "当前账号不能触发回滚。"
        }
      }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const confirmText = typeof body.confirmText === "string" ? body.confirmText.trim() : "";

    if (confirmText !== "CONFIRM_ROLLBACK") {
      return NextResponse.json({
        ok: false,
        success: false,
        error: {
          code: "ROLLBACK_CONFIRM_REQUIRED",
          message: "请输入 CONFIRM_ROLLBACK 后再触发回滚 workflow。"
        }
      }, { status: 400 });
    }

    const environment = resolveReleaseEnvironment(typeof body.environment === "string" ? body.environment : "prod");
    const rollbackRef = readRollbackRef(body.rollbackRef);
    const plan = buildRollbackPlan(rollbackRef);
    const workflow = "admin-ingest-rollback.yml";
    const ref = "main";
    const releaseHead = git(["rev-parse", "HEAD"]);
    const github = getGithubActionsState();
    const manualCommand = plan.commands[0] ?? null;

    if (!github.available) {
      const audit = appendReleaseAuditRecord({
        action: "rollback",
        actor,
        environment,
        ref: rollbackRef,
        releaseHead,
        status: "warning",
        reason: github.reason
      });

      return NextResponse.json({
        ok: true,
        dispatched: false,
        workflow,
        ref,
        runUrl: null,
        reason: github.reason,
        manualCommand,
        commands: plan.commands,
        warning: plan.warning,
        auditId: audit.id
      }, {
        headers: {
          "Cache-Control": "no-store"
        }
      });
    }

    const dispatch = await dispatchWorkflow(workflow, {
      ref,
      inputs: {
        environment,
        rollbackRef,
        confirmText,
        deploy: "false"
      }
    });
    const audit = appendReleaseAuditRecord({
      action: "rollback",
      actor,
      environment,
      ref: rollbackRef,
      releaseHead,
      status: dispatch.dispatched ? "success" : "error",
      reason: dispatch.reason
    });

    return NextResponse.json({
      ok: true,
      dispatched: dispatch.dispatched,
      workflow,
      ref,
      runUrl: dispatch.runUrl,
      reason: dispatch.reason,
      manualCommand: dispatch.dispatched ? null : manualCommand,
      commands: plan.commands,
      warning: plan.warning,
      auditId: audit.id
    }, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
