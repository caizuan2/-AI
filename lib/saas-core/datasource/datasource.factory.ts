import type { IDataSource } from "@/lib/saas-core/datasource/base.datasource";
import { mockDataSource } from "@/lib/saas-core/datasource/mock.datasource";
import type { DataSourceType } from "@/types/saas-core";

function createPrismaPlaceholderDataSource(): IDataSource {
  const notImplemented = async () => {
    throw new Error("Prisma datasource is reserved for a future database integration stage.");
  };

  return {
    type: "prisma",
    tenants: {
      getTenantById: notImplemented,
      listTenants: notImplemented,
      createTenant: notImplemented,
      updateTenant: notImplemented
    },
    users: {
      getUserById: notImplemented,
      listUsersByTenant: notImplemented,
      updateUserRole: notImplemented
    },
    knowledge: {
      searchKnowledge: notImplemented,
      addKnowledge: notImplemented,
      listKnowledgeByTenant: notImplemented
    },
    ai: {
      logAIRequest: notImplemented,
      getAIStats: notImplemented
    },
    system: {
      getSystemHealth: notImplemented,
      getMetrics: notImplemented
    }
  };
}

export function getConfiguredDataSourceType(): DataSourceType {
  return process.env.SAAS_CORE_DATASOURCE === "prisma" ? "prisma" : "mock";
}

export function getDataSource(type: DataSourceType = getConfiguredDataSourceType()): IDataSource {
  if (type === "prisma") {
    return createPrismaPlaceholderDataSource();
  }

  return mockDataSource;
}
