import { notFound } from "next/navigation";
import { IngestPublicGroupRoom } from "@/components/enterprise-admin/IngestPublicGroupRoom";
import { getActiveAdminIngestPublicConversation } from "@/lib/enterprise/admin-ingest-public-conversation-store";

export const dynamic = "force-dynamic";

export default async function AdminIngestGroupPage({
  params
}: {
  params: { token: string } | Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  const record = await getActiveAdminIngestPublicConversation(resolvedParams.token);

  if (!record || record.kind !== "group") {
    notFound();
  }

  return (
    <IngestPublicGroupRoom
      initial={{
        token: record.token,
        kind: record.kind,
        title: record.title,
        updatedAt: record.updatedAt,
        messages: record.messages,
        groupMessages: record.groupMessages
      }}
    />
  );
}
