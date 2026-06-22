const fallbackBaseUrl = "http://47.238.0.23";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeBaseUrl(value?: string | null) {
  const candidate = value?.trim();

  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return trimTrailingSlash(url.origin);
    }
  } catch {
    return null;
  }

  return null;
}

function readForwardedProto(request: Request) {
  const value = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();

  return value === "https" || value === "http" ? value : null;
}

function buildBaseUrlFromHost(request: Request) {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim();

  if (!host) {
    return null;
  }

  let protocol = readForwardedProto(request);

  if (!protocol) {
    try {
      protocol = new URL(request.url).protocol.replace(":", "") as "http" | "https";
    } catch {
      protocol = "http";
    }
  }

  return normalizeBaseUrl(`${protocol}://${host}`);
}

export function getConversationActionBaseUrl(request?: Request) {
  const origin = normalizeBaseUrl(request?.headers.get("origin"));

  if (origin) {
    return origin;
  }

  if (request) {
    const hostBaseUrl = buildBaseUrlFromHost(request);

    if (hostBaseUrl) {
      return hostBaseUrl;
    }
  }

  for (const value of [process.env.NEXT_PUBLIC_APP_URL, process.env.APP_BASE_URL, process.env.PUBLIC_BASE_URL]) {
    const baseUrl = normalizeBaseUrl(value);

    if (baseUrl) {
      return baseUrl;
    }
  }

  if (request) {
    const requestBaseUrl = normalizeBaseUrl(request.url);

    if (requestBaseUrl) {
      return requestBaseUrl;
    }
  }

  return fallbackBaseUrl;
}

export function buildConversationActionUrl(request: Request | undefined, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return new URL(normalizedPath, `${getConversationActionBaseUrl(request)}/`).toString();
}

export function buildConversationShareUrl(request: Request | undefined, token: string) {
  return buildConversationActionUrl(request, `/api/public/conversation-shares/${encodeURIComponent(token)}`);
}

export function buildGroupChatInviteUrl(request: Request | undefined, token: string) {
  return buildConversationActionUrl(request, `/api/public/group-chat-invites/${encodeURIComponent(token)}`);
}
