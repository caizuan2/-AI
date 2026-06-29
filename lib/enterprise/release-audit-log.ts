import "server-only";

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { RbacUser } from "@/lib/auth/rbac";
import type { ReleaseAction, ReleaseAuditRecord, ReleaseEnvironment, ReleaseStatus } from "@/lib/enterprise/release-console-types";

const AUDIT_LOG_PATH = "artifacts/admin-ingest/release-audit-log.json";
let memoryAuditRecords: ReleaseAuditRecord[] = [];

function auditPath() {
  return resolve(process.cwd(), AUDIT_LOG_PATH);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRecord(value: unknown): ReleaseAuditRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const action = readString(record.action);
  const environment = readString(record.environment);

  if (!action || !["publish", "rollback", "refresh", "copy-command"].includes(action)) {
    return null;
  }

  if (!environment || !["dev", "staging", "prod"].includes(environment)) {
    return null;
  }

  return {
    id: readString(record.id) ?? randomUUID(),
    action: action as ReleaseAction,
    actorRole: readString(record.actorRole) ?? "unknown",
    actorName: readString(record.actorName) ?? "unknown",
    environment: environment as ReleaseEnvironment,
    ref: readString(record.ref),
    releaseHead: readString(record.releaseHead),
    status: (readString(record.status) ?? "unknown") as ReleaseStatus,
    reason: readString(record.reason),
    createdAt: readString(record.createdAt) ?? new Date().toISOString()
  };
}

function readFileRecords() {
  const target = auditPath();

  if (!existsSync(target)) {
    return [] as ReleaseAuditRecord[];
  }

  try {
    const parsed = JSON.parse(readFileSync(target, "utf8").replace(/^\uFEFF/, "")) as unknown;
    const values = Array.isArray(parsed) ? parsed : [];

    return values
      .map(normalizeRecord)
      .filter((record): record is ReleaseAuditRecord => Boolean(record));
  } catch {
    return [] as ReleaseAuditRecord[];
  }
}

function writeFileRecords(records: ReleaseAuditRecord[]) {
  const target = auditPath();

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(records.slice(0, 100), null, 2)}\n`, "utf8");
}

export function readReleaseAuditLog(limit = 20) {
  const fileRecords = readFileRecords();
  const records = fileRecords.length ? fileRecords : memoryAuditRecords;

  return records
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export function appendReleaseAuditRecord(input: {
  action: ReleaseAction;
  actor: RbacUser | null;
  environment: ReleaseEnvironment;
  ref: string | null;
  releaseHead: string | null;
  status: ReleaseStatus;
  reason?: string | null;
}) {
  const record: ReleaseAuditRecord = {
    id: randomUUID(),
    action: input.action,
    actorRole: input.actor?.role ?? "unknown",
    actorName: input.actor?.name ?? input.actor?.phone ?? input.actor?.email ?? input.actor?.id ?? "unknown",
    environment: input.environment,
    ref: input.ref,
    releaseHead: input.releaseHead,
    status: input.status,
    reason: input.reason ?? null,
    createdAt: new Date().toISOString()
  };

  try {
    const nextRecords = [record, ...readFileRecords()].slice(0, 100);
    writeFileRecords(nextRecords);
  } catch {
    memoryAuditRecords = [record, ...memoryAuditRecords].slice(0, 100);
  }

  return record;
}
