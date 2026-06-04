"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  SendHorizontal,
  Sparkles,
  TriangleAlert,
  UploadCloud
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DocumentStatusBadge } from "@/components/product/document-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { unwrapApiResponse } from "@/lib/api/client";
import {
  getKnowledgeQualityAverage,
  isLowQualityKnowledge,
  knowledgeQualityScoreKeys,
  knowledgeQualityScoreLabels,
  type KnowledgeQualityScores
} from "@/lib/knowledge/quality";
import { documentRows } from "@/lib/mock/product-ui";

type SubmitState = "idle" | "loading" | "success" | "error";
type SaveStrategy = "MANUAL_CONFIRM" | "AUTO_SAVE_AFTER_AI" | "ANALYZE_ONLY";

interface UploadSegment {
  index: number;
  charLength: number;
  preview: string;
}

interface UploadAnalyzeResult extends KnowledgeQualityScores {
  shouldSave: boolean;
  title: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  reason: string;
  saveStrategy: SaveStrategy;
  saveRecommendation: string;
  file: {
    name: string;
    type: string;
    extension: string;
    size: number;
    maxSize: number;
  };
  content: string;
  charLength: number;
  segmentCount: number;
  segments: UploadSegment[];
  sourceType: "document";
  sourceTitle: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  }

  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<UploadAnalyzeResult | null>(null);
  const [uploadState, setUploadState] = useState<SubmitState>("idle");
  const [saveState, setSaveState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");

  const qualityAverage = analysis ? getKnowledgeQualityAverage(analysis) : null;
  const lowQuality = analysis ? isLowQualityKnowledge(analysis) : false;
  const accept = ".txt,.md,.pdf,.docx";
  const maxSize = analysis?.file.maxSize ?? 10 * 1024 * 1024;

  const canConfirm = useMemo(
    () => Boolean(analysis && analysis.shouldSave && saveState !== "loading"),
    [analysis, saveState]
  );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;

    setFile(nextFile);
    setAnalysis(null);
    setSaveState("idle");
    setError("");

    if (nextFile && nextFile.size > maxSize) {
      setError(`文件过大，请上传不超过 ${formatBytes(maxSize)} 的文件。`);
      setUploadState("error");
    } else {
      setUploadState("idle");
    }
  }

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("请选择要上传的文件。");
      setUploadState("error");
      return;
    }

    if (file.size > maxSize) {
      setError(`文件过大，请上传不超过 ${formatBytes(maxSize)} 的文件。`);
      setUploadState("error");
      return;
    }

    setError("");
    setAnalysis(null);
    setUploadState("loading");
    setSaveState("idle");

    try {
      const formData = new FormData();

      formData.append("file", file);

      const response = await fetch("/api/upload/analyze", {
        method: "POST",
        body: formData
      });
      const data = await unwrapApiResponse<UploadAnalyzeResult>(response, "文件分析失败。");

      setAnalysis(data);
      setUploadState("success");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "文件分析失败。");
      setUploadState("error");
    }
  }

  async function handleConfirmSave() {
    if (!analysis) {
      setError("请先上传并分析文件。");
      setSaveState("error");
      return;
    }

    setError("");
    setSaveState("loading");

    try {
      const response = await fetch("/api/knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: analysis.title,
          content: analysis.content,
          summary: analysis.summary,
          tags: analysis.tags,
          category: analysis.category,
          importance: analysis.importance,
          clarityScore: analysis.clarityScore,
          completenessScore: analysis.completenessScore,
          usefulnessScore: analysis.usefulnessScore,
          confidenceScore: analysis.confidenceScore,
          sourceType: "document",
          sourceTitle: analysis.sourceTitle,
          sourceUrl: null,
          sourceMessageId: null
        })
      });

      await unwrapApiResponse<unknown>(response, "入库失败，请稍后重试。");
      setSaveState("success");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "入库失败，请稍后重试。");
      setSaveState("error");
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Upload"
        title="文件上传投喂"
        description="上传 txt、md、pdf 或 docx 文件，提取文本后由 AI 整理为知识。"
      />

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-600" />
                <CardTitle>文档管理</CardTitle>
              </div>
              <CardDescription>查看上传文档、所属知识库和索引状态。</CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
              同步状态
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border border-line dark:border-slate-700">
              <div className="hidden grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr_0.6fr] gap-3 border-b border-line bg-canvas px-4 py-3 text-xs font-semibold text-muted dark:border-slate-700 dark:bg-slate-900 md:grid">
                <span>文档</span>
                <span>所属知识库</span>
                <span>更新时间</span>
                <span>索引状态</span>
                <span className="text-right">操作</span>
              </div>
              <div className="divide-y divide-line dark:divide-slate-700">
                {documentRows.map((document) => {
                  const Icon = document.icon;

                  return (
                    <article
                      key={document.id}
                      className="grid gap-3 bg-white px-4 py-4 text-sm dark:bg-slate-950 md:grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr_0.6fr] md:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink dark:text-slate-100">{document.title}</p>
                            <p className="mt-1 text-xs text-muted dark:text-slate-400">{document.type} · {document.size}</p>
                          </div>
                        </div>
                      </div>
                      <p className="text-muted dark:text-slate-400">{document.knowledgeBase}</p>
                      <p className="text-muted dark:text-slate-400">{document.updatedAt}</p>
                      <DocumentStatusBadge status={document.status} />
                      <div className="flex justify-end">
                        <Button variant="ghost" size="icon" aria-label={`打开 ${document.title} 的更多操作`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>上传入口</CardTitle>
            <CardDescription>移动端和桌面端都保持同一条投喂流程。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted dark:text-slate-400">
            <div className="rounded-lg border border-line bg-canvas p-3 dark:border-slate-700 dark:bg-slate-900">
              支持 txt、md、pdf、docx。文件过长会自动分段，确认后写入 document 来源。
            </div>
            <div className="rounded-lg border border-line bg-canvas p-3 dark:border-slate-700 dark:bg-slate-900">
              索引完成后，问答页会把命中的文档片段展示为引用来源。
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UploadCloud className="h-4 w-4 text-teal-700" />
              <CardTitle>上传文件</CardTitle>
            </div>
            <CardDescription>单个文件不超过 {formatBytes(maxSize)}。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleAnalyze} className="space-y-4">
              <label className="block rounded-lg border border-dashed border-line bg-canvas p-6 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-white text-teal-700">
                  <FileText className="h-5 w-5" />
                </span>
                <span className="mt-3 block text-sm font-medium text-ink">
                  {file ? file.name : "选择文件"}
                </span>
                <span className="mt-1 block text-xs text-muted">
                  支持 .txt / .md / .pdf / .docx
                </span>
                <input
                  type="file"
                  accept={accept}
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>

              {file ? (
                <div className="rounded-lg border border-line bg-white p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">{file.name}</span>
                    <Badge variant={file.size > maxSize ? "warning" : "secondary"}>{formatBytes(file.size)}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted">{file.type || "未知 MIME 类型"}</p>
                </div>
              ) : null}

              <Button type="submit" disabled={uploadState === "loading" || !file} className="w-full">
                {uploadState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                提取并整理
              </Button>
            </form>

            {error ? (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <TriangleAlert className="h-4 w-4" />
                {error}
              </div>
            ) : null}

            {uploadState === "success" && analysis ? (
              <div className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm text-teal-700">
                <CheckCircle2 className="h-4 w-4" />
                已提取 {analysis.charLength} 个字符，自动分为 {analysis.segmentCount} 段。
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-coral" />
                <CardTitle>AI 整理结果</CardTitle>
              </div>
              <CardDescription>确认后会以 document 来源写入知识库。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {uploadState === "loading" ? (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas p-5 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在提取文本并整理...
                </div>
              ) : null}

              {!analysis && uploadState !== "loading" ? (
                <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
                  上传文件后会在这里显示整理结果。
                </div>
              ) : null}

              {analysis ? (
                <>
                  <div>
                    <p className="text-xs text-muted">标题</p>
                    <p className="mt-1 text-sm font-semibold text-ink">{analysis.title}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">摘要</p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{analysis.summary}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted">分类</p>
                      <Badge className="mt-2">{analysis.category}</Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted">重要程度</p>
                      <Badge className="mt-2" variant={analysis.importance >= 4 ? "warning" : "secondary"}>
                        {analysis.importance}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-muted">知识质量评分</p>
                      <Badge variant={lowQuality ? "warning" : "secondary"}>平均 {qualityAverage}/5</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {knowledgeQualityScoreKeys.map((key) => (
                        <div key={key} className="rounded-lg border border-line bg-canvas px-3 py-2">
                          <p className="text-xs text-muted">{knowledgeQualityScoreLabels[key]}</p>
                          <p className="mt-1 text-sm font-semibold text-ink">{analysis[key]}/5</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted">标签</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {analysis.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted">入库建议</p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{analysis.reason}</p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleConfirmSave}
                    disabled={!canConfirm || saveState === "success"}
                    className="w-full"
                  >
                    {saveState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {saveState === "success" ? "已入库" : "确认入库"}
                  </Button>
                  {!analysis.shouldSave ? (
                    <p className="text-xs leading-5 text-muted">AI 暂不建议入库。如确需保存，可补充文件内容后重新上传。</p>
                  ) : null}
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>文本分段</CardTitle>
              <CardDescription>长文本会先分段分析，确认后完整原文入库并生成知识 chunks。</CardDescription>
            </CardHeader>
            <CardContent>
              {!analysis ? (
                <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
                  暂无分段。
                </div>
              ) : (
                <div className="space-y-3">
                  {analysis.segments.slice(0, 6).map((segment) => (
                    <article key={segment.index} className="rounded-lg border border-line bg-canvas p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-ink">分段 {segment.index + 1}</p>
                        <span className="text-xs text-muted">{segment.charLength} 字</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{segment.preview}</p>
                    </article>
                  ))}
                  {analysis.segments.length > 6 ? (
                    <p className="text-xs text-muted">还有 {analysis.segments.length - 6} 段未展示。</p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
