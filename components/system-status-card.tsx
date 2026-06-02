"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface HealthResponse {
  status: "ok";
  database: boolean;
  openai: boolean;
  supabase: boolean;
}

type ServiceKey = "database" | "openai" | "supabase";

const services: Array<{ key: ServiceKey; label: string }> = [
  { key: "database", label: "Database" },
  { key: "openai", label: "OpenAI" },
  { key: "supabase", label: "Supabase" }
];

const REFRESH_INTERVAL_MS = 30_000;

export function SystemStatusCard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadHealth() {
      try {
        const response = await fetch("/api/health", {
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error("health request failed");
        }

        const data = (await response.json()) as HealthResponse;

        if (!isMounted) {
          return;
        }

        setHealth(data);
        setError("");
      } catch {
        if (isMounted) {
          setError("健康检查暂时不可用");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadHealth();
    const timer = window.setInterval(loadHealth, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const allReady = health ? services.every((service) => health[service.key]) : false;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal-700" />
              <CardTitle>系统状态</CardTitle>
            </div>
            <CardDescription>
              <Link href="/api/health" className="text-teal-700 hover:text-teal-800">
                /api/health
              </Link>
            </CardDescription>
          </div>
          <Badge variant={allReady ? "default" : "warning"}>
            {isLoading ? "检测中" : allReady ? "可用" : "需配置"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {services.map((service) => {
              const ready = Boolean(health?.[service.key]);

              return (
                <div
                  key={service.key}
                  className="flex min-h-16 items-center justify-between rounded-lg border border-line px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{service.label}</p>
                    <p className="mt-1 text-xs text-muted">
                      {isLoading ? "检测中" : ready ? "正常" : "异常"}
                    </p>
                  </div>
                  {isLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin text-muted" />
                  ) : (
                    <CheckCircle2
                      className={cn("h-5 w-5", ready ? "text-teal-700" : "text-slate-300")}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
