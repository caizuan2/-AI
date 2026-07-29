import {
  authorizeGatewayRequest,
  type GatewayContext,
  jsonError
} from "./responses";

function readResponseId(request: Request, context: GatewayContext) {
  const contextId = context.params?.responseId?.trim();

  if (contextId) {
    return contextId;
  }

  const match = new URL(request.url).pathname.match(/\/v1\/responses\/([^/]+)$/);

  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function isValidResponseId(value: string) {
  return /^resp_[A-Za-z0-9_-]{8,200}$/.test(value);
}

export default async function handler(request: Request, context: GatewayContext = {}) {
  if (request.method !== "GET") {
    return jsonError(405, "OPENAI_GATEWAY_METHOD_NOT_ALLOWED", "Only GET is allowed.");
  }

  const authorization = authorizeGatewayRequest(request, context);

  if (!authorization.ok) {
    return authorization.response;
  }

  const responseId = readResponseId(request, context);

  if (!isValidResponseId(responseId)) {
    return jsonError(400, "OPENAI_GATEWAY_RESPONSE_ID_INVALID", "Response ID is invalid.");
  }

  try {
    const upstreamResponse = await fetch(`${authorization.upstreamBaseUrl}/responses/${encodeURIComponent(responseId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authorization.upstreamApiKey}`,
        "Cache-Control": "no-store"
      }
    });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": upstreamResponse.headers.get("content-type") || "application/json",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return jsonError(502, "OPENAI_GATEWAY_UPSTREAM_FAILED", "OpenAI upstream request failed.");
  }
}

export const config = {
  path: "/v1/responses/:responseId"
};
