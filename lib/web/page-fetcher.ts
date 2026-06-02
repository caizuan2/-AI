import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { load } from "cheerio";
import { ValidationError } from "@/lib/errors";

const FETCH_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 50000;
const MIN_CONTENT_LENGTH = 40;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "0.0.0.0"
]);

export interface FetchedWebPage {
  url: string;
  title: string;
  content: string;
}

export function isProbablyUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }

  if (/^www\.[^\s]+$/i.test(trimmed)) {
    return true;
  }

  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/?#].*)?$/i.test(trimmed)) {
    return true;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeUrl(input: string) {
  const trimmed = input.trim();
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    throw new ValidationError("链接格式不正确，请输入完整的网页 URL。");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("暂时只支持 http 或 https 网页链接。");
  }

  url.hash = "";
  return url;
}

function isPrivateIPv4(ipAddress: string) {
  const parts = ipAddress.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [first, second] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIPv6(ipAddress: string) {
  const normalized = ipAddress.toLowerCase();
  const mappedIPv4Prefix = "::ffff:";

  if (normalized.startsWith(mappedIPv4Prefix)) {
    return isPrivateIPv4(normalized.slice(mappedIPv4Prefix.length));
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function isPrivateAddress(address: string) {
  const version = isIP(address);

  if (version === 4) {
    return isPrivateIPv4(address);
  }

  if (version === 6) {
    return isPrivateIPv6(address);
  }

  return true;
}

async function assertPublicUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new ValidationError("该链接指向本地或内网地址，暂不支持抓取。");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new ValidationError("该链接指向本地或内网地址，暂不支持抓取。");
    }

    return;
  }

  let addresses: Array<{ address: string }>;

  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new ValidationError("无法解析网页域名，请确认链接是否正确。");
  }

  if (addresses.length === 0 || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new ValidationError("该链接指向本地或内网地址，暂不支持抓取。");
  }
}

async function fetchWithRedirects(url: URL, redirectCount = 0): Promise<{ response: Response; finalUrl: URL }> {
  await assertPublicUrl(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "AI-Knowledge-Base/1.0 (+web-ingest)"
      },
      redirect: "manual",
      signal: controller.signal
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

      if (!location) {
        throw new ValidationError("网页发生重定向，但没有返回目标地址。");
      }

      if (redirectCount >= MAX_REDIRECTS) {
        throw new ValidationError("网页重定向次数过多，暂时无法抓取。");
      }

      return fetchWithRedirects(normalizeUrl(new URL(location, url).toString()), redirectCount + 1);
    }

    return { response, finalUrl: url };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ValidationError("网页抓取超时，请稍后重试或换一个链接。");
    }

    throw new ValidationError("网页抓取失败，请确认链接可访问。");
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeText(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function pickTitle(html: string) {
  const $ = load(html);
  const candidates = [
    $("meta[property='og:title']").attr("content"),
    $("meta[name='twitter:title']").attr("content"),
    $("title").first().text(),
    $("h1").first().text()
  ];

  return normalizeText(candidates.find((item) => item && item.trim()) ?? "");
}

function extractReadableText(html: string) {
  const $ = load(html);
  const contentSelectors = [
    "article",
    "main",
    "[role='main']",
    ".article",
    ".post",
    ".entry-content",
    ".post-content",
    ".content",
    "#content"
  ];
  let bestText = "";

  $("script, style, noscript, svg, canvas, iframe, form, nav, header, footer, aside").remove();
  $("br").replaceWith("\n");
  $("p, li, h1, h2, h3, h4, h5, h6, div, section, article, main, tr").append("\n");

  for (const selector of contentSelectors) {
    $(selector).each((_, element) => {
      const text = normalizeText($(element).text());

      if (text.length > bestText.length) {
        bestText = text;
      }
    });
  }

  const bodyText = normalizeText($("body").text());
  const text = bestText.length >= Math.min(bodyText.length, 200) ? bestText : bodyText;

  return text.slice(0, MAX_EXTRACTED_CHARS);
}

export async function fetchWebPageContent(input: string): Promise<FetchedWebPage> {
  const initialUrl = normalizeUrl(input);
  const { response, finalUrl } = await fetchWithRedirects(initialUrl);

  if (!response.ok) {
    throw new ValidationError(`网页返回 ${response.status}，暂时无法抓取正文。`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new ValidationError("该链接不是可解析的网页正文，请换一个文章页面。");
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");

  if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
    throw new ValidationError("网页内容过大，暂时无法直接投喂。");
  }

  const html = await response.text();

  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    throw new ValidationError("网页内容过大，暂时无法直接投喂。");
  }

  const title = pickTitle(html) || finalUrl.hostname;
  const content = extractReadableText(html);

  if (content.length < MIN_CONTENT_LENGTH) {
    throw new ValidationError("没有从网页中提取到足够正文，请换一个可公开访问的文章页面。");
  }

  return {
    url: finalUrl.toString(),
    title,
    content
  };
}
