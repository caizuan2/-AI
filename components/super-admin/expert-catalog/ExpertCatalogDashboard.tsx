"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Bot,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  X
} from "lucide-react";
import {
  archiveExpertCatalogAgentClient,
  archiveExpertCatalogZoneClient,
  createExpertCatalogAgentClient,
  createExpertCatalogZoneClient,
  getExpertCatalogClient,
  updateExpertCatalogAgentClient,
  updateExpertCatalogZoneClient
} from "@/lib/super-admin/expert-catalog-client";
import type {
  ExpertCatalogAgent,
  ExpertCatalogSnapshot,
  ExpertCatalogStatus,
  ExpertCatalogZone
} from "@/types/super-admin-expert-catalog";

const inputClass =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
const buttonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

const statusLabels: Record<ExpertCatalogStatus, string> = {
  active: "已上架",
  hidden: "已隐藏",
  archived: "已归档"
};

function StatusBadge({ status }: { status: ExpertCatalogStatus }) {
  const tone =
    status === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "hidden"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>
      {statusLabels[status]}
    </span>
  );
}

function LockedBinding({ agent }: { agent: ExpertCatalogAgent }) {
  return (
    <div className="min-w-[220px]">
      <div className="flex items-center gap-1.5 font-mono text-xs text-slate-700">
        <LockKeyhole className="h-3.5 w-3.5 text-teal-700" />
        {agent.knowledgeBaseId}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {agent.protectedBinding ? "受保护固定绑定" : "创建后不可修改"}
      </p>
    </div>
  );
}

export function ExpertCatalogDashboard() {
  const [catalog, setCatalog] = useState<ExpertCatalogSnapshot | null>(null);
  const [view, setView] = useState<"agents" | "zones">("agents");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<ExpertCatalogAgent | null>(null);
  const [editingZone, setEditingZone] = useState<ExpertCatalogZone | null>(null);
  const [agentForm, setAgentForm] = useState({
    displayName: "",
    knowledgeBaseId: "",
    zoneKey: "",
    description: "",
    avatar: ""
  });
  const [zoneName, setZoneName] = useState("");

  async function loadCatalog(silent = false) {
    if (!silent) {
      setLoading(true);
    }

    try {
      const next = await getExpertCatalogClient();
      setCatalog(next);
      setError(null);
      setAgentForm((current) => ({
        ...current,
        zoneKey:
          current.zoneKey ||
          next.zones.find((zone) => zone.status === "active")?.zoneKey ||
          ""
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "目录加载失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
  }, []);

  const filteredAgents = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const agents = catalog?.agents ?? [];

    if (!keyword) {
      return agents;
    }

    return agents.filter((agent) =>
      [
        agent.displayName,
        agent.agentKey,
        agent.knowledgeBaseId,
        agent.zoneName,
        ...agent.aliases
      ].some((value) => value.toLowerCase().includes(keyword))
    );
  }, [catalog, search]);

  const filteredZones = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const zones = catalog?.zones ?? [];

    if (!keyword) {
      return zones;
    }

    return zones.filter((zone) =>
      [zone.displayName, zone.zoneKey].some((value) =>
        value.toLowerCase().includes(keyword)
      )
    );
  }, [catalog, search]);

  async function runAction(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key);
    setError(null);
    setMessage(null);

    try {
      await action();
      await loadCatalog(true);
      setMessage(success);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作失败。");
    } finally {
      setBusy(null);
    }
  }

  async function submitNewAgent(event: React.FormEvent) {
    event.preventDefault();
    await runAction(
      "create-agent",
      () =>
        createExpertCatalogAgentClient({
          displayName: agentForm.displayName,
          knowledgeBaseId: agentForm.knowledgeBaseId,
          zoneKey: agentForm.zoneKey,
          description: agentForm.description || null,
          avatar: agentForm.avatar || null
        }),
      "Agent 已创建为隐藏状态，确认固定知识库后可上架。"
    );
    setShowAgentForm(false);
    setAgentForm((current) => ({
      displayName: "",
      knowledgeBaseId: "",
      zoneKey: current.zoneKey,
      description: "",
      avatar: ""
    }));
  }

  async function saveAgent(event: React.FormEvent) {
    event.preventDefault();
    if (!editingAgent) {
      return;
    }

    await runAction(
      `agent-${editingAgent.agentKey}`,
      () =>
        updateExpertCatalogAgentClient(editingAgent.agentKey, {
          displayName: editingAgent.displayName,
          zoneKey: editingAgent.zoneKey,
          status: editingAgent.status,
          sortOrder: editingAgent.sortOrder,
          description: editingAgent.description,
          avatar: editingAgent.avatar
        }),
      "Agent 展示配置已保存，固定知识库绑定未改变。"
    );
    setEditingAgent(null);
  }

  async function submitNewZone(event: React.FormEvent) {
    event.preventDefault();
    await runAction(
      "create-zone",
      () => createExpertCatalogZoneClient({ displayName: zoneName }),
      "专区已创建。"
    );
    setZoneName("");
    setShowZoneForm(false);
  }

  async function saveZone(event: React.FormEvent) {
    event.preventDefault();
    if (!editingZone) {
      return;
    }

    await runAction(
      `zone-${editingZone.zoneKey}`,
      () =>
        updateExpertCatalogZoneClient(editingZone.zoneKey, {
          displayName: editingZone.displayName,
          status: editingZone.status,
          sortOrder: editingZone.sortOrder
        }),
      "专区展示配置已保存，Agent 知识库未改变。"
    );
    setEditingZone(null);
  }

  if (loading) {
    return (
      <section className="border-y border-slate-200 bg-white px-5 py-16 text-center text-sm text-slate-500">
        <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin" />
        正在读取 Agent 目录配置...
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="border-y border-slate-200 bg-white">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">目录控制</h2>
            <p className="mt-1 text-sm text-slate-500">
              展示配置与知识库作用域分离；锁定字段无法通过此后台修改。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setView("agents")}
                className={`h-8 rounded px-3 text-sm font-medium ${view === "agents" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
              >
                Agent
              </button>
              <button
                type="button"
                onClick={() => setView("zones")}
                className={`h-8 rounded px-3 text-sm font-medium ${view === "zones" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
              >
                专区
              </button>
            </div>
            <button
              type="button"
              onClick={() => void loadCatalog()}
              className={`${buttonClass} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
              title="刷新目录"
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
            <button
              type="button"
              onClick={() => view === "agents" ? setShowAgentForm(true) : setShowZoneForm(true)}
              className={`${buttonClass} border-slate-950 bg-slate-950 text-white hover:bg-slate-800`}
            >
              <Plus className="h-4 w-4" />
              {view === "agents" ? "新增 Agent" : "新建专区"}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-200 px-5 py-4">
          <label className="relative block max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${inputClass} pl-9`}
              placeholder={view === "agents" ? "搜索名称、Agent ID、知识库或专区" : "搜索专区名称或标识"}
            />
          </label>
        </div>
      </section>

      {error ? (
        <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {view === "agents" ? (
        <section className="overflow-hidden border-y border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-5 py-3">Agent</th>
                  <th className="px-5 py-3">固定知识库</th>
                  <th className="px-5 py-3">专区</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">排序</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredAgents.map((agent) => (
                  <tr key={agent.agentKey} className="align-top">
                    <td className="px-5 py-4">
                      <div className="flex min-w-[220px] items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-teal-50 font-semibold text-teal-700">
                          {agent.avatar || <Bot className="h-4 w-4" />}
                        </span>
                        <div>
                          <div className="flex items-center gap-2 font-medium text-slate-950">
                            {agent.displayName}
                            {agent.protectedBinding ? (
                              <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-700">
                                固定
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 font-mono text-xs text-slate-500">{agent.agentKey}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4"><LockedBinding agent={agent} /></td>
                    <td className="px-5 py-4 text-slate-700">{agent.zoneName}</td>
                    <td className="px-5 py-4"><StatusBadge status={agent.status} /></td>
                    <td className="px-5 py-4 text-slate-600">{agent.sortOrder}</td>
                    <td className="px-5 py-4">
                      <div className="flex min-w-[180px] justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingAgent({ ...agent })}
                          className={`${buttonClass} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
                        >
                          <Pencil className="h-4 w-4" />
                          编辑
                        </button>
                        <button
                          type="button"
                          disabled={agent.status === "archived" || busy !== null}
                          onClick={() => {
                            if (!window.confirm(`确认下架“${agent.displayName}”？已添加用户和知识库不会被删除。`)) {
                              return;
                            }
                            void runAction(
                              `archive-${agent.agentKey}`,
                              () => archiveExpertCatalogAgentClient(agent.agentKey),
                              "Agent 已归档，知识库和用户关系保持不变。"
                            );
                          }}
                          className={`${buttonClass} border-slate-300 bg-white text-slate-600 hover:border-rose-300 hover:text-rose-700`}
                        >
                          <Archive className="h-4 w-4" />
                          下架
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredAgents.length === 0 ? (
            <div className="border-t border-slate-200 px-5 py-12 text-center text-sm text-slate-500">
              没有匹配的 Agent。
            </div>
          ) : null}
        </section>
      ) : (
        <section className="overflow-hidden border-y border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-5 py-3">专区名称</th>
                  <th className="px-5 py-3">不可变标识</th>
                  <th className="px-5 py-3">Agent 数</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">排序</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredZones.map((zone) => (
                  <tr key={zone.zoneKey}>
                    <td className="px-5 py-4 font-medium text-slate-950">{zone.displayName}</td>
                    <td className="px-5 py-4 font-mono text-xs text-slate-600">{zone.zoneKey}</td>
                    <td className="px-5 py-4 text-slate-700">{zone.agentCount}</td>
                    <td className="px-5 py-4"><StatusBadge status={zone.status} /></td>
                    <td className="px-5 py-4 text-slate-600">{zone.sortOrder}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingZone({ ...zone })}
                          className={`${buttonClass} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
                        >
                          <Pencil className="h-4 w-4" />
                          编辑
                        </button>
                        <button
                          type="button"
                          disabled={zone.status === "archived" || zone.agentCount > 0 || busy !== null}
                          onClick={() => {
                            if (!window.confirm(`确认归档专区“${zone.displayName}”？`)) {
                              return;
                            }
                            void runAction(
                              `archive-zone-${zone.zoneKey}`,
                              () => archiveExpertCatalogZoneClient(zone.zoneKey),
                              "专区已归档。"
                            );
                          }}
                          className={`${buttonClass} border-slate-300 bg-white text-slate-600 hover:border-rose-300 hover:text-rose-700`}
                          title={zone.agentCount > 0 ? "请先移动专区中的 Agent" : "归档专区"}
                        >
                          <Archive className="h-4 w-4" />
                          归档
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showAgentForm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
          <form onSubmit={submitNewAgent} className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="font-semibold text-slate-950">新增 Agent</h3>
                <p className="mt-1 text-xs text-slate-500">新 Agent 默认隐藏，固定知识库创建后不可修改。</p>
              </div>
              <button type="button" onClick={() => setShowAgentForm(false)} title="关闭">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                展示名称
                <input required className={inputClass} value={agentForm.displayName} onChange={(event) => setAgentForm({ ...agentForm, displayName: event.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                固定知识库 ID
                <input required className={inputClass} placeholder="kb-example-specialist" value={agentForm.knowledgeBaseId} onChange={(event) => setAgentForm({ ...agentForm, knowledgeBaseId: event.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                所属专区
                <select required className={inputClass} value={agentForm.zoneKey} onChange={(event) => setAgentForm({ ...agentForm, zoneKey: event.target.value })}>
                  {(catalog?.zones ?? []).filter((zone) => zone.status === "active").map((zone) => <option key={zone.zoneKey} value={zone.zoneKey}>{zone.displayName}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                头像文字
                <input className={inputClass} maxLength={2} value={agentForm.avatar} onChange={(event) => setAgentForm({ ...agentForm, avatar: event.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                简介
                <textarea className="min-h-24 w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" value={agentForm.description} onChange={(event) => setAgentForm({ ...agentForm, description: event.target.value })} />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setShowAgentForm(false)} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}>取消</button>
              <button disabled={busy !== null} className={`${buttonClass} border-slate-950 bg-slate-950 text-white`}>
                <Plus className="h-4 w-4" />创建 Agent
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editingAgent ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
          <form onSubmit={saveAgent} className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="font-semibold text-slate-950">编辑 Agent 展示配置</h3>
                <p className="mt-1 font-mono text-xs text-slate-500">{editingAgent.agentKey}</p>
              </div>
              <button type="button" onClick={() => setEditingAgent(null)} title="关闭"><X className="h-5 w-5 text-slate-500" /></button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                展示名称
                <input required className={inputClass} value={editingAgent.displayName} onChange={(event) => setEditingAgent({ ...editingAgent, displayName: event.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                所属专区
                <select className={inputClass} value={editingAgent.zoneKey} onChange={(event) => setEditingAgent({ ...editingAgent, zoneKey: event.target.value })}>
                  {(catalog?.zones ?? []).filter((zone) => zone.status !== "archived").map((zone) => <option key={zone.zoneKey} value={zone.zoneKey}>{zone.displayName}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                状态
                <select className={inputClass} value={editingAgent.status} onChange={(event) => setEditingAgent({ ...editingAgent, status: event.target.value as ExpertCatalogStatus })}>
                  <option value="active">已上架</option>
                  <option value="hidden">已隐藏</option>
                  <option value="archived">已归档</option>
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                排序
                <input type="number" min={0} max={100000} className={inputClass} value={editingAgent.sortOrder} onChange={(event) => setEditingAgent({ ...editingAgent, sortOrder: Number(event.target.value) })} />
              </label>
              <div className="rounded-md border border-teal-200 bg-teal-50 p-3 sm:col-span-2">
                <p className="text-xs font-semibold text-teal-800">固定知识库（只读）</p>
                <p className="mt-1 font-mono text-sm text-teal-900">{editingAgent.knowledgeBaseId}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setEditingAgent(null)} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}>取消</button>
              <button disabled={busy !== null} className={`${buttonClass} border-slate-950 bg-slate-950 text-white`}><Save className="h-4 w-4" />保存</button>
            </div>
          </form>
        </div>
      ) : null}

      {showZoneForm || editingZone ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
          <form onSubmit={editingZone ? saveZone : submitNewZone} className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="font-semibold text-slate-950">{editingZone ? "编辑专区" : "新建专区"}</h3>
              <button type="button" onClick={() => { setShowZoneForm(false); setEditingZone(null); }} title="关闭"><X className="h-5 w-5 text-slate-500" /></button>
            </div>
            <div className="space-y-4 p-5">
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                专区名称
                <input required className={inputClass} value={editingZone?.displayName ?? zoneName} onChange={(event) => editingZone ? setEditingZone({ ...editingZone, displayName: event.target.value }) : setZoneName(event.target.value)} />
              </label>
              {editingZone ? (
                <>
                  <label className="space-y-1.5 text-sm font-medium text-slate-700">
                    状态
                    <select className={inputClass} value={editingZone.status} onChange={(event) => setEditingZone({ ...editingZone, status: event.target.value as ExpertCatalogStatus })}>
                      <option value="active">已上架</option>
                      <option value="hidden">已隐藏</option>
                      <option value="archived">已归档</option>
                    </select>
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-slate-700">
                    排序
                    <input type="number" min={0} max={100000} className={inputClass} value={editingZone.sortOrder} onChange={(event) => setEditingZone({ ...editingZone, sortOrder: Number(event.target.value) })} />
                  </label>
                </>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => { setShowZoneForm(false); setEditingZone(null); }} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}>取消</button>
              <button disabled={busy !== null} className={`${buttonClass} border-slate-950 bg-slate-950 text-white`}><Save className="h-4 w-4" />保存</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
