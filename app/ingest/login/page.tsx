import { Suspense } from "react";
import { IngestSaasAuthPortal } from "@/components/enterprise-admin/IngestSaasAuthPortal";

export const dynamic = "force-dynamic";

export default function IngestLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#f6f7f4]" />}>
      <IngestSaasAuthPortal mode="login" />
    </Suspense>
  );
}
