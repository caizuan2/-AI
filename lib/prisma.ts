import { PrismaClient } from "@prisma/client";
import { getDatabaseUrlWithPoolerParams } from "@/lib/safe-db-url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getPrismaClient() {
  if (!globalForPrisma.prisma) {
    const runtimeDatabaseUrl = getDatabaseUrlWithPoolerParams();

    globalForPrisma.prisma = new PrismaClient({
      ...(runtimeDatabaseUrl
        ? {
            datasources: {
              db: {
                url: runtimeDatabaseUrl
              }
            }
          }
        : {}),
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
    });
  }

  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);

    if (typeof value === "function") {
      return value.bind(client);
    }

    return value;
  }
});
