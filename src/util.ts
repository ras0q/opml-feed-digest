import { Readability } from "@mozilla/readability";
import { DOMParser } from "linkedom";

export function isSafeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    return host !== "localhost" && !host.endsWith(".localhost") &&
      !/^(?:127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/
        .test(host) &&
      host !== "::1";
  } catch {
    return false;
  }
}

export async function fetchExternal(
  fetcher: typeof fetch,
  rawUrl: string,
  timeoutMs: number,
): Promise<Response> {
  let url = rawUrl;
  for (let redirects = 0; redirects < 4; redirects++) {
    if (!isSafeUrl(url)) throw new Error("Unsafe redirect URL");
    const response = await fetcher(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "opml-news-digest/1.0" },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    url = new URL(location, url).href;
  }
  throw new Error("Too many redirects");
}

export async function retry<T>(
  operation: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let last: unknown;
  for (let index = 0; index < attempts; index++) {
    try {
      return await operation();
    } catch (error) {
      last = error;
      if (index < attempts - 1) {
        await new Promise((r) => setTimeout(r, 250 * 2 ** index));
      }
    }
  }
  throw last;
}

export async function articleId(
  guid: string | undefined,
  rawUrl: string,
  feedUrl: string,
  title: string,
  published?: string,
): Promise<string> {
  const value = guid || normalizeUrl(rawUrl) ||
    `${feedUrl}\u0000${title}\u0000${published ?? ""}`;
  const bytes = new TextEncoder().encode(value);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
    }
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.href;
  } catch {
    return "";
  }
}

export function textFromHtml(value: string): string {
  const source = value.includes("<") ? value : `<body>${value}</body>`;
  const document = new DOMParser().parseFromString(source, "text/html");
  if (!document) return "";

  const article = new Readability(document).parse();
  const text = article?.textContent ?? document.body?.textContent ??
    document.textContent ?? "";

  return text.replace(/\s+/g, " ").trim();
}

export const limit = (value: string, length: number) => value.slice(0, length);
