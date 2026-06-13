export type AppStorePlatform = "android" | "windows" | "ios" | "macos" | "web" | "electron";

export interface AppRegistryEntry {
  key: string;
  id: string;
  name: string;
  platforms: AppStorePlatform[];
}

export type AppRegistry = Record<string, AppRegistryEntry>;

export const appRegistry: AppRegistry = {
  user: {
    key: "user",
    id: "ai.chat.user",
    name: "AI知识库助手",
    platforms: ["android", "windows", "ios", "macos", "web", "electron"]
  },
  admin: {
    key: "admin",
    id: "ai.chat.admin",
    name: "AI知识库管理后台",
    platforms: ["android", "windows", "ios", "macos", "web", "electron"]
  }
};

export function listRegisteredApps(registry: AppRegistry = appRegistry) {
  return Object.values(registry).map((entry) => ({
    ...entry,
    platforms: [...entry.platforms]
  }));
}

export function getRegisteredApp(appKey: string, registry: AppRegistry = appRegistry) {
  const entry = registry[appKey];

  if (!entry) {
    return null;
  }

  return {
    ...entry,
    platforms: [...entry.platforms]
  };
}

export function registerApp(registry: AppRegistry, entry: AppRegistryEntry): AppRegistry {
  return {
    ...registry,
    [entry.key]: {
      ...entry,
      platforms: [...entry.platforms]
    }
  };
}
