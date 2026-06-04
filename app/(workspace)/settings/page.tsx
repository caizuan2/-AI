"use client";

import { ChangeEvent, useEffect, useState } from "react";
import {
  Braces,
  CheckCircle2,
  Database,
  Download,
  FileText,
  KeyRound,
  Loader2,
  Save,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Table,
  TriangleAlert,
  UploadCloud
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { unwrapApiResponse } from "@/lib/api/client";

type SaveStrategy = "MANUAL_CONFIRM" | "AUTO_SAVE_AFTER_AI" | "ANALYZE_ONLY";
type ExportFormat = "json" | "markdown" | "csv";
type UserSettingsResponse = {
  saveStrategy: SaveStrategy;
  defaultExpireDays: number;
  preferredProvider: string | null;
  preferredModel: string | null;
  ragTopK: number | null;
  ragMinScore: number | null;
  updatedAt: string;
};

type KnowledgeExportResponse = {
  format: ExportFormat;
  filename: string;
  mimeType: string;
  exportedAt: string;
  itemCount: number;
  content: string;
};

type KnowledgeImportResponse = {
  imported: number;
  skippedDuplicates: number;
  failed: number;
  createdItems: Array<{
    id: string;
    title: string;
  }>;
  duplicates: Array<{
    index: number;
    title: string;
    reason: string;
    existingId: string | null;
    existingTitle: string | null;
  }>;
  errors: Array<{
    index: number;
    title: string | null;
    message: string;
  }>;
};

const saveStrategyOptions: Array<{
  value: SaveStrategy;
  title: string;
  description: string;
}> = [
  {
    value: "MANUAL_CONFIRM",
    title: "手动确认入库",
    description: "AI 只整理和建议，点击确认后才写入知识库。"
  },
  {
    value: "AUTO_SAVE_AFTER_AI",
    title: "AI 判断后自动入库",
    description: "AI 判断值得保存时，投喂页会自动写入知识库。"
  },
  {
    value: "ANALYZE_ONLY",
    title: "永不自动入库，仅分析",
    description: "只展示整理结果，不提供入库动作。"
  }
];

const exportOptions: Array<{
  format: ExportFormat;
  title: string;
  description: string;
  icon: typeof Braces;
}> = [
  {
    format: "json",
    title: "JSON",
    description: "完整备份，可再次导入。",
    icon: Braces
  },
  {
    format: "markdown",
    title: "Markdown",
    description: "适合阅读和归档。",
    icon: FileText
  },
  {
    format: "csv",
    title: "CSV",
    description: "适合表格分析。",
    icon: Table
  }
];

function downloadTextFile(file: KnowledgeExportResponse) {
  const content = file.format === "csv" ? `\uFEFF${file.content}` : file.content;
  const blob = new Blob([content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function SettingsPage() {
  const [saveStrategy, setSaveStrategy] = useState<SaveStrategy>("MANUAL_CONFIRM");
  const [defaultExpireDays, setDefaultExpireDays] = useState(90);
  const [preferredProvider, setPreferredProvider] = useState("openai");
  const [preferredModel, setPreferredModel] = useState("gpt-4.1-mini");
  const [ragTopK, setRagTopK] = useState(8);
  const [ragMinScore, setRagMinScore] = useState(0.72);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [requireCitations, setRequireCitations] = useState(true);
  const [useMockApi, setUseMockApi] = useState(true);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [importingKnowledge, setImportingKnowledge] = useState(false);
  const [importResult, setImportResult] = useState<KnowledgeImportResponse | null>(null);
  const [transferMessage, setTransferMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoadingSettings(true);
      setError("");

      try {
        const response = await fetch("/api/settings");
        const data = await unwrapApiResponse<UserSettingsResponse>(response, "加载设置失败。");

        if (!cancelled) {
          setSaveStrategy(data.saveStrategy);
          setDefaultExpireDays(data.defaultExpireDays);
          setPreferredProvider(data.preferredProvider ?? "openai");
          setPreferredModel(data.preferredModel ?? "gpt-4.1-mini");
          setRagTopK(data.ragTopK ?? 8);
          setRagMinScore(data.ragMinScore ?? 0.72);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "加载设置失败。");
        }
      } finally {
        if (!cancelled) {
          setLoadingSettings(false);
        }
      }
    }

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSavingSettings(true);
    setSaved(false);
    setError("");

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          saveStrategy,
          defaultExpireDays,
          preferredProvider,
          preferredModel,
          ragTopK,
          ragMinScore
        })
      });
      const data = await unwrapApiResponse<UserSettingsResponse>(response, "保存设置失败。");

      setSaveStrategy(data.saveStrategy);
      setDefaultExpireDays(data.defaultExpireDays);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "保存设置失败。");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleExport(format: ExportFormat) {
    setExportingFormat(format);
    setError("");
    setTransferMessage("");

    try {
      const response = await fetch(`/api/knowledge/export?format=${format}`);
      const data = await unwrapApiResponse<KnowledgeExportResponse>(response, "导出知识库失败。");

      downloadTextFile(data);
      setTransferMessage(`已导出 ${data.itemCount} 条知识：${data.filename}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "导出知识库失败。");
    } finally {
      setExportingFormat(null);
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setImportingKnowledge(true);
    setImportResult(null);
    setTransferMessage("");
    setError("");

    try {
      if (!file.name.toLowerCase().endsWith(".json")) {
        throw new Error("请选择 JSON 文件。");
      }

      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const response = await fetch("/api/knowledge/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await unwrapApiResponse<KnowledgeImportResponse>(response, "导入知识库失败。");

      setImportResult(data);
      setTransferMessage(`导入完成：新增 ${data.imported} 条，跳过重复 ${data.skippedDuplicates} 条。`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "导入知识库失败。");
    } finally {
      setImportingKnowledge(false);
      event.target.value = "";
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Settings"
        title="设置"
        description="查看知识库 MVP 的运行配置。真实运行参数通过 .env 管理。"
      >
        {saved ? <Badge>已保存</Badge> : null}
      </PageHeader>

      {error ? (
        <section className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <TriangleAlert className="h-4 w-4" />
          {error}
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-teal-700" />
                <CardTitle>知识保存策略</CardTitle>
              </div>
              <CardDescription>控制投喂内容在 AI 整理后的入库方式。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingSettings ? (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas p-4 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在加载保存策略...
                </div>
              ) : (
                <div className="space-y-3">
                  {saveStrategyOptions.map((option) => {
                    const checked = saveStrategy === option.value;

                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                          checked ? "border-teal-200 bg-teal-50" : "border-line bg-white hover:bg-canvas"
                        }`}
                      >
                        <input
                          type="radio"
                          name="saveStrategy"
                          value={option.value}
                          checked={checked}
                          onChange={() => setSaveStrategy(option.value)}
                          className="mt-1 h-4 w-4 border-line text-teal-600"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-ink">{option.title}</span>
                          <span className="mt-1 block text-xs leading-5 text-muted">{option.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <Button onClick={handleSave} disabled={loadingSettings || savingSettings} className="w-full sm:w-auto">
                {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存知识策略
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-teal-700" />
                <CardTitle>知识过期提醒</CardTitle>
              </div>
              <CardDescription>新入库知识会按默认周期设置过期时间，过期后检索权重会降低。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-ink">默认过期提醒周期</span>
                <div className="mt-2 flex max-w-xs items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    value={defaultExpireDays}
                    onChange={(event) => setDefaultExpireDays(Number(event.target.value))}
                  />
                  <span className="text-sm text-muted">天</span>
                </div>
              </label>
              <Button onClick={handleSave} disabled={loadingSettings || savingSettings} className="w-full sm:w-auto">
                {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存过期设置
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-teal-700" />
                <CardTitle>知识导入导出</CardTitle>
              </div>
              <CardDescription>导出当前账号的知识库，或从 JSON 备份导入知识。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                {exportOptions.map((option) => {
                  const Icon = option.icon;
                  const loading = exportingFormat === option.format;

                  return (
                    <button
                      key={option.format}
                      type="button"
                      onClick={() => handleExport(option.format)}
                      disabled={Boolean(exportingFormat) || importingKnowledge}
                      className="focus-ring flex min-h-28 flex-col items-start justify-between rounded-lg border border-line bg-white p-4 text-left transition hover:bg-canvas disabled:pointer-events-none disabled:opacity-60"
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 text-teal-700" />}
                        导出 {option.title}
                      </span>
                      <span className="text-xs leading-5 text-muted">{option.description}</span>
                    </button>
                  );
                })}
              </div>

              <label className="block">
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <UploadCloud className="h-4 w-4 text-teal-700" />
                  从 JSON 导入
                </span>
                <Input
                  className="mt-2"
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImport}
                  disabled={importingKnowledge || Boolean(exportingFormat)}
                />
              </label>

              {importingKnowledge ? (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在导入并生成知识片段...
                </div>
              ) : null}

              {transferMessage ? (
                <div className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm text-teal-700">
                  <CheckCircle2 className="h-4 w-4" />
                  {transferMessage}
                </div>
              ) : null}

              {importResult ? (
                <div className="space-y-3 rounded-lg border border-line bg-canvas p-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <div className="text-xs text-muted">新增</div>
                      <div className="mt-1 font-semibold text-ink">{importResult.imported}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">跳过重复</div>
                      <div className="mt-1 font-semibold text-ink">{importResult.skippedDuplicates}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">失败</div>
                      <div className="mt-1 font-semibold text-ink">{importResult.failed}</div>
                    </div>
                  </div>
                  {importResult.duplicates.length > 0 ? (
                    <div className="space-y-1 text-xs leading-5 text-muted">
                      {importResult.duplicates.slice(0, 3).map((duplicate) => (
                        <div key={`${duplicate.index}-${duplicate.title}`}>
                          第 {duplicate.index + 1} 条「{duplicate.title}」已跳过：{duplicate.reason}
                          {duplicate.existingTitle ? `，匹配「${duplicate.existingTitle}」` : ""}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {importResult.errors.length > 0 ? (
                    <div className="space-y-1 text-xs leading-5 text-rose-700">
                      {importResult.errors.slice(0, 3).map((item) => (
                        <div key={`${item.index}-${item.title ?? "unknown"}`}>
                          第 {item.index + 1} 条{item.title ? `「${item.title}」` : ""}导入失败：{item.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-teal-700" />
                <CardTitle>模型与 API</CardTitle>
              </div>
              <CardDescription>OpenAI 配置由服务端环境变量读取，页面不展示真实 key。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-ink">OpenAI API Key</span>
                <Input className="mt-2" value="由 OPENAI_API_KEY 提供" readOnly />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">默认生成 Provider</span>
                <select
                  value={preferredProvider}
                  onChange={(event) => {
                    const provider = event.target.value;

                    setPreferredProvider(provider);
                    setPreferredModel(provider === "deepseek" ? "deepseek-chat" : "gpt-4.1-mini");
                  }}
                  className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm"
                >
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">默认生成模型</span>
                <Input
                  className="mt-2"
                  value={preferredModel}
                  onChange={(event) => setPreferredModel(event.target.value)}
                  placeholder={preferredProvider === "deepseek" ? "deepseek-chat" : "gpt-4.1-mini"}
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
                <span>
                  <span className="block text-sm font-medium text-ink">开发环境本地 fallback</span>
                  <span className="block text-xs text-muted">仅用于本地调试；生产环境必须配置真实 OpenAI key。</span>
                </span>
                <input
                  checked={useMockApi}
                  onChange={(event) => setUseMockApi(event.target.checked)}
                  type="checkbox"
                  className="h-5 w-5 rounded border-line text-teal-600"
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <SearchCheck className="h-4 w-4 text-coral" />
                <CardTitle>检索与引用</CardTitle>
              </div>
              <CardDescription>控制问答是否必须带引用来源。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
                <span>
                  <span className="block text-sm font-medium text-ink">回答必须带引用</span>
                  <span className="block text-xs text-muted">关闭后仍会优先展示来源，但不强制阻断回答。</span>
                </span>
                <input
                  checked={requireCitations}
                  onChange={(event) => setRequireCitations(event.target.checked)}
                  type="checkbox"
                  className="h-5 w-5 rounded border-line text-teal-600"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-ink">Top K</span>
                  <Input
                    className="mt-2"
                    type="number"
                    min={1}
                    max={20}
                    value={ragTopK}
                    onChange={(event) => setRagTopK(Number(event.target.value))}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-ink">最低置信度</span>
                  <Input
                    className="mt-2"
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={ragMinScore}
                    onChange={(event) => setRagMinScore(Number(event.target.value))}
                  />
                </label>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-teal-700" />
                <CardTitle>数据库状态</CardTitle>
              </div>
              <CardDescription>当前项目通过 Prisma 连接 PostgreSQL，并使用 pgvector 保存 embedding。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {["PostgreSQL", "pgvector", "Prisma Client"].map((item) => (
                <div key={item} className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2">
                  <span className="text-slate-700">{item}</span>
                  <Badge variant="default">已接入</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-teal-700" />
                <CardTitle>MVP 边界</CardTitle>
              </div>
              <CardDescription>不做团队协作、知识图谱、语音和微信导入。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm text-teal-700">
                <CheckCircle2 className="h-4 w-4" />
                当前默认策略为手动确认入库。
              </div>
              <Button onClick={handleSave} disabled={loadingSettings || savingSettings} className="w-full">
                {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存页面设置
              </Button>
            </CardContent>
          </Card>
        </aside>
      </section>
    </div>
  );
}
