import { PlugZap, RefreshCw, ShieldCheck } from "lucide-react";
import { DataSourceCard } from "@/components/product/data-source-card";
import { MetricCard } from "@/components/product/metric-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { dataSources } from "@/lib/mock/product-ui";

export const dynamic = "force-dynamic";

export default function DataSourcesPage() {
  const connectedCount = dataSources.filter((source) => source.status === "connected").length;
  const syncingCount = dataSources.filter((source) => source.status === "syncing").length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Sources"
        title="数据源连接"
        description="连接团队知识来源，统一同步、索引和追踪来源状态。"
      >
        <Button variant="outline">
          <RefreshCw className="h-4 w-4" />
          同步全部
        </Button>
      </PageHeader>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="可连接来源" value={String(dataSources.length)} change="7 类" icon={PlugZap} />
        <MetricCard label="已连接" value={String(connectedCount)} change="+1" icon={ShieldCheck} />
        <MetricCard label="同步中" value={String(syncingCount)} change="实时" icon={RefreshCw} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dataSources.map((source) => (
          <DataSourceCard key={source.id} {...source} />
        ))}
      </section>
    </div>
  );
}
