import { FileClock, GitBranch, LockKeyhole, ShieldAlert } from "lucide-react";
import { ConversationControlsPanel } from "@/components/super-admin/conversation-controls/ConversationControlsPanel";
import {
  buildConversationFeatureFlagResponse,
  getConversationFeatureFlags
} from "@/lib/conversation-control/feature-flags";

const apiRows = [
  ["GET", "/api/user/conversation-features", "用户端读取功能开关，决定菜单项是否启用。"],
  ["PATCH", "/api/user/conversations/:id/rename", "用户本人范围内重命名会话。"],
  ["PATCH", "/api/user/conversations/:id/archive", "用户本人范围内归档或取消归档会话。"],
  ["DELETE", "/api/user/conversations/:id", "软删除本人会话，附件与知识库文档保留。"],
  ["POST", "/api/user/conversations/:id/share", "生成会话分享预留状态。"],
  ["POST", "/api/user/conversations/:id/group-chat", "基于本人会话创建群聊预留状态。"]
];

const policyCards = [
  {
    title: "本人会话边界",
    description: "普通用户只能操作 userId 等于自己的 CHAT 会话，不能管理其他用户历史记录。",
    icon: LockKeyhole
  },
  {
    title: "危险操作审计",
    description: "重命名、归档、删除、分享、群聊和开关更新都会写入 AuditLog。",
    icon: FileClock
  },
  {
    title: "投喂版边界",
    description: "会话操作不影响知识库投喂、资料来源、原始文件和管理员投喂流程。",
    icon: GitBranch
  },
  {
    title: "删除安全策略",
    description: "删除只写入 metadata 软删除标记，不物理删除消息附件和知识库文档。",
    icon: ShieldAlert
  }
];

export const dynamic = "force-dynamic";

export default async function ConversationControlsPage() {
  const flags = await getConversationFeatureFlags();

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold text-teal-700">Conversation Control Center</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
          历史会话权限 / 开关 / 审计
        </h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          面向用户端历史会话更多菜单的第二阶段能力。本页只管理后端开关、权限策略和审计，不修改用户端 Flutter 与管理员投喂版功能。
        </p>
      </section>

      <ConversationControlsPanel initialFlags={buildConversationFeatureFlagResponse(flags)} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {policyCards.map((item) => {
          const Icon = item.icon;

          return (
            <article key={item.title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-700">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-lg font-semibold tracking-normal text-slate-950">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
            </article>
          );
        })}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">用户端 API 接入规范</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Worktree 1 后续只需要读取开关并调用以下接口；功能关闭时后端会返回 403 与明确错误信息。
        </p>
        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Method</th>
                <th className="px-4 py-3 font-semibold">Path</th>
                <th className="px-4 py-3 font-semibold">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {apiRows.map(([method, path, description]) => (
                <tr key={path}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{method}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{path}</td>
                  <td className="px-4 py-3 text-slate-500">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
