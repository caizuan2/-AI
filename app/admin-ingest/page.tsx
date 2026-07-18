import type { Metadata } from "next";
import { IngestModeToggle } from "@/components/enterprise-admin/IngestModeToggle";

export const metadata: Metadata = {
  title: "AI知识库投喂端 | Admin Ingest",
  description: "企业级 AI 投喂工作台"
};

export default function AdminIngestPage() {
  return <IngestModeToggle />;
}
