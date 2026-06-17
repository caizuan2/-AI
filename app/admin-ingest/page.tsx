import type { Metadata } from "next";
import { IngestModeToggle } from "@/components/enterprise-admin/IngestModeToggle";

export const metadata: Metadata = {
  title: "Admin Ingest EXE | AI 知识库",
  description: "企业级 AI 投喂工作台"
};

export default function AdminIngestPage() {
  return <IngestModeToggle />;
}
