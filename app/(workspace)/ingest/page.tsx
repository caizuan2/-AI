import { redirect } from "next/navigation";

const adminIngestEntry = "/admin-ingest?app=ingest-admin&platform=web";

export default function IngestPage() {
  redirect(adminIngestEntry);
}
