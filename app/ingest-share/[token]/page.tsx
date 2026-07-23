import { notFound } from "next/navigation";
import { getActiveAdminIngestPublicConversation } from "@/lib/enterprise/admin-ingest-public-conversation-store";

export const dynamic = "force-dynamic";

export default async function AdminIngestSharePage({
  params
}: {
  params: { token: string } | Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  const record = await getActiveAdminIngestPublicConversation(resolvedParams.token);

  if (!record || record.kind !== "share") {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#f5f5f3] px-4 py-8 text-[#202020]">
      <div className="mx-auto w-full max-w-3xl">
        <header className="rounded-[28px] border border-[#e7e7e3] bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#128246]">投喂端对话分享</p>
          <h1 className="mt-2 text-2xl font-semibold">{record.title}</h1>
          <p className="mt-2 text-sm text-[#777]">此页面仅包含创建分享链接时屏幕可见的提问与回答正文。</p>
        </header>

        <section className="mt-5 space-y-3">
          {record.messages.map((item) => (
            <article
              key={item.id}
              className={[
                "rounded-[24px] border p-5 shadow-sm",
                item.role === "assistant"
                  ? "border-[#e2ece5] bg-[#f8fcf9]"
                  : "border-[#e7e7e3] bg-white"
              ].join(" ")}
            >
              <p className="text-xs font-semibold text-[#777]">{item.role === "assistant" ? "回答" : "提问"}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{item.content}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
