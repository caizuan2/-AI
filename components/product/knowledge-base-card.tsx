import { Database, LockKeyhole, RefreshCw } from "lucide-react";
import { DocumentStatusBadge } from "@/components/product/document-status-badge";

export function KnowledgeBaseCard({
  title,
  description,
  documentCount,
  updatedAt,
  permission,
  indexStatus
}: {
  title: string;
  description: string;
  documentCount: number;
  updatedAt: string;
  permission: string;
  indexStatus: "ready" | "indexing" | "failed";
}) {
  return (
    <article className="rounded-lg border border-line bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-soft dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
          <Database className="h-5 w-5" />
        </span>
        <DocumentStatusBadge status={indexStatus} />
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink dark:text-slate-100">{title}</h3>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted dark:text-slate-400">{description}</p>
      <div className="mt-4 grid gap-3 text-xs text-muted dark:text-slate-400 sm:grid-cols-3">
        <span className="flex items-center gap-1">
          <Database className="h-3.5 w-3.5" />
          {documentCount} 文档
        </span>
        <span className="flex items-center gap-1">
          <RefreshCw className="h-3.5 w-3.5" />
          {updatedAt}
        </span>
        <span className="flex items-center gap-1">
          <LockKeyhole className="h-3.5 w-3.5" />
          {permission}
        </span>
      </div>
    </article>
  );
}
