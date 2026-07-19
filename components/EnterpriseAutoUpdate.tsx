"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AppUpdateNotice } from "@/components/AppUpdateNotice";
import { ADMIN_APP_KIND, USER_APP_KIND, type AppKind } from "@/lib/app-version";

const locallyManagedPaths = ["/chat-ui", "/app"];
const adminManagedPaths = [
  "/admin-download",
  "/admin-ingest",
  "/admin",
  "/ingest",
  "/super-admin",
  "/workspace"
];

export function isLocallyManagedUpdatePath(pathname: string) {
  return locallyManagedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function resolveUpdateAppKind(pathname: string, search = ""): AppKind {
  const appParam = new URLSearchParams(search).get("app");

  if (appParam === ADMIN_APP_KIND || appParam === "ingest-admin") {
    return ADMIN_APP_KIND;
  }

  if (adminManagedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return ADMIN_APP_KIND;
  }

  return USER_APP_KIND;
}

export function EnterpriseAutoUpdate() {
  const pathname = usePathname() || "/";
  const [appKind, setAppKind] = React.useState<AppKind | null>(null);

  React.useEffect(() => {
    if (isLocallyManagedUpdatePath(pathname)) {
      setAppKind(null);
      return;
    }

    setAppKind(resolveUpdateAppKind(pathname, window.location.search));
  }, [pathname]);

  if (!appKind) {
    return null;
  }

  return <AppUpdateNotice appKind={appKind} />;
}
