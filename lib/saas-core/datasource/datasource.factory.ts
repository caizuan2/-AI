import type { IDataSource } from "@/lib/saas-core/datasource/base.datasource";
import { mockDataSource } from "@/lib/saas-core/datasource/mock.datasource";
import { prismaDataSource } from "@/lib/saas-core/datasource/prisma.datasource";
import type { DataSourceType } from "@/types/saas-core";

export function getConfiguredDataSourceType(): DataSourceType {
  const mode = process.env.SAAS_MODE ?? process.env.SAAS_CORE_DATASOURCE;

  return mode === "prisma" ? "prisma" : "mock";
}

export function getDataSource(type: DataSourceType = getConfiguredDataSourceType()): IDataSource {
  if (type === "prisma") {
    return prismaDataSource;
  }

  return mockDataSource;
}
