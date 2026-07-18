export type Config = {
  opmlPath: string;
  statePath: string;
  timeZone: string;
  maxArticles: number;
  maxArticlesPerFeed: number;
  maxArticleAgeDays: number;
  maxInputChars: number;
  minFeedContentChars: number;
  httpTimeoutMs: number;
  llmTimeoutMs: number;
  llmMaxOutputTokens: number;
  llmBatchSize: number;
  llmApiBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  language: string;
  stateRetentionDays: number;
  stateMaxEntries: number;
};

type LoadConfigOptions = {
  requireLlm?: boolean;
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

const optional = (name: string) => process.env[name] ?? "";

const text = (name: string, fallback: string) => {
  const value = process.env[name]?.trim() ?? fallback;
  if (!value) throw new Error(`${name} must not be empty`);
  return value;
};

/**
 * Loads runtime configuration from environment variables.
 *
 * LLM settings are optional only for local diagnostics that inject their own
 * summarizer. Production digest generation must keep the default requirement.
 */
export function loadConfig(options: LoadConfigOptions = {}): Config {
  const llm = options.requireLlm ?? true;
  return {
    opmlPath: process.env.OPML_PATH ?? "feeds.opml",
    statePath: process.env.STATE_PATH ?? ".state/processed.json",
    timeZone: process.env.TIME_ZONE ?? "Asia/Tokyo",
    maxArticles: number("MAX_ARTICLES", 20),
    maxArticlesPerFeed: number("MAX_ARTICLES_PER_FEED", 3),
    maxArticleAgeDays: number("MAX_ARTICLE_AGE_DAYS", 3),
    maxInputChars: number("MAX_INPUT_CHARS", 12_000),
    minFeedContentChars: number("MIN_FEED_CONTENT_CHARS", 1_000),
    httpTimeoutMs: number("HTTP_TIMEOUT_MS", 15_000),
    llmTimeoutMs: number("LLM_TIMEOUT_MS", 30_000),
    llmMaxOutputTokens: number("LLM_MAX_OUTPUT_TOKENS", 700),
    llmBatchSize: number("LLM_BATCH_SIZE", 5),
    llmApiBaseUrl: llm
      ? required("LLM_API_BASE_URL")
      : optional("LLM_API_BASE_URL"),
    llmApiKey: llm ? required("LLM_API_KEY") : optional("LLM_API_KEY"),
    llmModel: llm ? required("LLM_MODEL") : optional("LLM_MODEL"),
    language: text("LANGUAGE", "Japanese"),
    stateRetentionDays: number("STATE_RETENTION_DAYS", 90),
    stateMaxEntries: number("STATE_MAX_ENTRIES", 5_000),
  };
}
