import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { appendReleaseAuditRecord } from "@/lib/enterprise/release-audit-log";
import { dispatchWorkflow, getGithubActionsState } from "@/lib/enterprise/release-github-actions-client";
import { buildReleasePermissions } from "@/lib/enterprise/release-console-service";
import { git, resolveReleaseEnvironment } from "@/lib/enterprise/release-manifest-reader";
import type { ReleaseEnvironment } from "@/lib/enterprise/release-console-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function manualPublishCommand(input: {
  environment: ReleaseEnvironment;
  buildWeb: boolean;
  buildApk: boolean;
  buildExe: boolean;
  deployWeb: boolean;
  runQa: boolean;
}) {
  return [
    "gh workflow run admin-ingest-release.yml --ref main",
    `-f environment=${input.environment}`,
    `-f buildWeb=${String(input.buildWeb)}`,
    `-f buildApk=${String(input.buildApk)}`,
    `-f buildExe=${String(input.buildExe)}`,
    `-f deployWeb=${String(input.deployWeb)}`,
    `-f runQa=${String(input.runQa)}`
  ].join(" ");
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_release_publish"
    });
    const permissions = buildReleasePermissions(actor);

    if (!permissions.canPublish) {
      return NextResponse.json({
        ok: false,
        success: false,
        error: {
          code: "RELEASE_PUBLISH_FORBIDDEN",
          message: "当前账号不能触发发布。"
        }
      }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const environment = resolveReleaseEnvironment(typeof body.environment === "string" ? body.environment : "prod");

    if (permissions.role === "ingest_admin" && environment === "prod") {
      return NextResponse.json({
        ok: false,
        success: false,
        error: {
          code: "RELEASE_PROD_PUBLISH_FORBIDDEN",
          message: "ingest_admin 只能触发 dev / staging 发布。"
        }
      }, { status: 403 });
    }

    const options = {
      environment,
      buildWeb: readBoolean(body.buildWeb, true),
      buildApk: readBoolean(body.buildApk, true),
      buildExe: readBoolean(body.buildExe, true),
      deployWeb: readBoolean(body.deployWeb, environment === "prod"),
      runQa: readBoolean(body.runQa, true)
    };
    const workflow = "admin-ingest-release.yml";
    const ref = "main";
    const releaseHead = git(["rev-parse", "HEAD"]);
    const github = getGithubActionsState();
    const manualCommand = manualPublishCommand(options);

    if (!github.available) {
      const audit = appendReleaseAuditRecord({
        action: "publish",
        actor,
        environment,
        ref,
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
        environment: options.environment,
        buildWeb: String(options.buildWeb),
        buildApk: String(options.buildApk),
        buildExe: String(options.buildExe),
        deployWeb: String(options.deployWeb),
        runQa: String(options.runQa)
      }
    });
    const audit = appendReleaseAuditRecord({
      action: "publish",
      actor,
      environment,
      ref,
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
