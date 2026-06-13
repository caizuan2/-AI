"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AppUpdateNotice } from "@/components/AppUpdateNotice";
import { ADMIN_APP_KIND, USER_APP_KIND, type AppKind } from "@/lib/app-version";

const locallyManagedPaths = ["/chat-ui", "/ingest"];

function isLocallyManaged(pathname: string) {
  return locallyManagedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function resolveAppKind(pathname: string): AppKind {
  if (typeof window !== "undefined") {
    const appParam = new URLSearchParams(window.location.search).get("app");

    if (appParam === ADMIN_APP_KIND) {
      return ADMIN_APP_KIND;
    }
  }

  if (
    pathname === "/admin-download" ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/workspace")
  ) {
    return ADMIN_APP_KIND;
  }

  return USER_APP_KIND;
}

export function EnterpriseAutoUpdate() {
  const pathname = usePathname() || "/";
  const [appKind, setAppKind] = React.useState<AppKind | null>(null);

  React.useEffect(() => {
    if (isLocallyManaged(pathname)) {
      setAppKind(null);
      return;
    }

    setAppKind(resolveAppKind(pathname));
  }, [pathname]);

  if (!appKind) {
    return null;
  }

  return <AppUpdateNotice appKind={appKind} />;
}
