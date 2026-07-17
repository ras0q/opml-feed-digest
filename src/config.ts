export type Config = {
  opmlPath: string;
  statePath: string;
  timeZone: string;
  maxArticles: number;
  maxArticlesPerFeed: number;
  maxInputChars: number;
  httpTimeoutMs: number;
  llmTimeoutMs: number;
  llmMaxOutputTokens: number;
  llmApiBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  stateRetentionDays: number;
  stateMaxEntries: number;
};

const number = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
};

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export function loadConfig(): Config {
  return {
    opmlPath: process.env.OPML_PATH ?? "feeds.opml",
    statePath: process.env.STATE_PATH ?? ".state/processed.json",
    timeZone: process.env.TIME_ZONE ?? "Asia/Tokyo",
    maxArticles: number("MAX_ARTICLES", 10),
    maxArticlesPerFeed: number("MAX_ARTICLES_PER_FEED", 5),
    maxInputChars: number("MAX_INPUT_CHARS", 12_000),
    httpTimeoutMs: number("HTTP_TIMEOUT_MS", 15_000),
    llmTimeoutMs: number("LLM_TIMEOUT_MS", 30_000),
    llmMaxOutputTokens: number("LLM_MAX_OUTPUT_TOKENS", 700),
    llmApiBaseUrl: required("LLM_API_BASE_URL"),
    llmApiKey: required("LLM_API_KEY"),
    llmModel: process.env.LLM_MODEL ?? "grok-3-mini",
    stateRetentionDays: number("STATE_RETENTION_DAYS", 90),
    stateMaxEntries: number("STATE_MAX_ENTRIES", 5_000),
  };
}
