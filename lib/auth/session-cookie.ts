function parseCookieSecureFromUrl(value?: string | null): boolean | null {
  const url = value?.trim();

  if (!url) {
    return null;
  }

  try {
    const protocol = new URL(url).protocol;

    if (protocol === "https:") {
      return true;
    }

    if (protocol === "http:") {
      return false;
    }
  } catch {
    return null;
  }

  return null;
}

function getRequestHost(request?: Request) {
  const headerHost = request?.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    || request?.headers.get("host")?.trim()
    || "";

  if (headerHost) {
    return headerHost;
  }

  try {
    return request ? new URL(request.url).host : "";
  } catch {
    return "";
  }
}

function stripPort(host: string) {
  const normalized = host.trim().toLowerCase();

  if (normalized.startsWith("[") && normalized.includes("]")) {
    return normalized.slice(1, normalized.indexOf("]"));
  }

  return normalized.split(":")[0] ?? normalized;
}

function isLocalOrIpHost(host: string) {
  const hostname = stripPort(host);

  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

export function resolveSessionCookieSecure(request?: Request): boolean {
  const host = getRequestHost(request);

  if (isLocalOrIpHost(host)) {
    return false;
  }

  const forwardedProto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();

  if (forwardedProto === "https") {
    return true;
  }

  if (forwardedProto === "http") {
    return false;
  }

  const requestSecure = parseCookieSecureFromUrl(request?.url);

  if (requestSecure !== null) {
    return requestSecure;
  }

  const appUrlSecureValues = [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]
    .map(parseCookieSecureFromUrl)
    .filter((value): value is boolean => value !== null);

  if (appUrlSecureValues.includes(true)) {
    return true;
  }

  if (appUrlSecureValues.includes(false)) {
    return false;
  }

  return process.env.NODE_ENV === "production";
}
