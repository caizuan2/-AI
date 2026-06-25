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

export function resolveSessionCookieSecure(request?: Request): boolean {
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
