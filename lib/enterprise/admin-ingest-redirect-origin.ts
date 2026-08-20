type AdminIngestRedirectRequest = {
  url: string;
  headers: Pick<Headers, "get">;
};

function readFirstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function normalizePublicHost(value: string | null) {
  const candidate = readFirstHeaderValue(value);

  if (
    !candidate ||
    !/^(?:\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+)(?::[0-9]{1,5})?$/.test(candidate)
  ) {
    return null;
  }

  try {
    return new URL(`http://${candidate}`).host;
  } catch {
    return null;
  }
}

function readPublicProtocol(request: AdminIngestRedirectRequest) {
  const forwardedProtocol = readFirstHeaderValue(
    request.headers.get("x-forwarded-proto")
  )?.toLowerCase();

  if (forwardedProtocol === "http" || forwardedProtocol === "https") {
    return forwardedProtocol;
  }

  try {
    return new URL(request.url).protocol === "https:" ? "https" : "http";
  } catch {
    return "http";
  }
}

export function resolveAdminIngestPublicOrigin(
  request: AdminIngestRedirectRequest
) {
  const publicHost = normalizePublicHost(
    request.headers.get("x-forwarded-host")
  ) || normalizePublicHost(request.headers.get("host"));

  if (publicHost) {
    return `${readPublicProtocol(request)}://${publicHost}`;
  }

  return new URL(request.url).origin;
}

export function buildAdminIngestPublicRedirectUrl(
  request: AdminIngestRedirectRequest,
  pathname: "/ingest/login" | "/ingest/activate"
) {
  return new URL(pathname, `${resolveAdminIngestPublicOrigin(request)}/`);
}
