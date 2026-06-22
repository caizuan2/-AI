import { NextResponse } from "next/server";
import { getConfiguredDataSourceType } from "@/lib/saas-core/datasource/datasource.factory";
import type { SaaSCoreApiResponse } from "@/types/saas-core";

export function saasCoreSuccess<T>(data: T) {
  return NextResponse.json<SaaSCoreApiResponse<T>>({
    success: true,
    data,
    timestamp: Date.now(),
    datasource: getConfiguredDataSourceType()
  });
}

export function saasCoreError(error: unknown) {
  return NextResponse.json(
    {
      success: false,
      error: {
        message: error instanceof Error ? error.message : "SaaS Core request failed."
      },
      timestamp: Date.now(),
      datasource: getConfiguredDataSourceType()
    },
    {
      status: 500
    }
  );
}

export function getPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
