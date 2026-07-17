import { type Config, loadConfig } from "./src/config.ts";
import { markdown } from "./src/markdown.ts";
import { parseFeed, parseOpml } from "./src/parsers.ts";
import { summarizeBatch, type Summary } from "./src/summary.ts";
import { loadState, remember, saveState, trimState } from "./src/state.ts";
import {
  articleId,
  fetchExternal,
  isSafeUrl,
  limit,
  retry,
  textFromHtml,
} from "./src/util.ts";

type Article = {
  id: string;
  feedUrl: string;
  feedName: string;
  category?: string;
  title: string;
  url: string;
  published?: string;
  content: string;
  summary?: Summary;
};

type ErrorRecord = { source: string; message: string };

export async function opmlToMarkdown(
  opml: string,
  config = loadConfig(),
  deps: Partial<Dependencies> = {},
): Promise<string> {
  const d: Dependencies = {
    fetch: fetch,
    summarizeBatch,
    now: () => new Date(),
    persistState: true,
    ...deps,
  };
  const started = Date.now();
  const errors: ErrorRecord[] = [];

  console.error("News digest started");
  const feeds = parseOpml(opml);
  const state = await loadState(config.statePath);
  console.error(
    `Found ${feeds.length} feeds; restored ${state.entries.length} state entries`,
  );

  const articles: Article[] = [];
  let feedFailures = 0;
  for (const feed of feeds) {
    try {
      const xml = await retry(() =>
        fetchText(d.fetch, feed.url, config.httpTimeoutMs)
      );
      const parsed = parseFeed(xml, feed.url).slice(
        0,
        config.maxArticlesPerFeed,
      );
      for (const item of parsed) {
        const id = await articleId(
          item.guid,
          item.url,
          feed.url,
          item.title,
          item.published,
        );
        if (state.entries.some((entry) => entry.id === id)) continue;
        articles.push({
          ...item,
          id,
          feedUrl: feed.url,
          feedName: feed.name,
          category: feed.category,
        });
      }
    } catch (error) {
      feedFailures++;
      errors.push({ source: feed.name, message: safeMessage(error) });
      console.error(`Feed failed: ${feed.name}`);
    }
  }

  const selected = articles.slice(0, config.maxArticles);
  console.error(`Found ${selected.length} new articles`);
  if (selected.length === 0) return "";

  const ready: Article[] = [];
  for (const article of selected) {
    try {
      const content = await articleContent(article, config, d.fetch);
      if (!content) throw new Error("Article content is unavailable");
      article.content = content;
      ready.push(article);
    } catch (error) {
      errors.push({ source: article.title, message: safeMessage(error) });
      console.error(`Article failed: ${article.title}`);
    }
  }

  const completed: Article[] = [];
  for (let index = 0; index < ready.length; index += config.llmBatchSize) {
    const batch = ready.slice(index, index + config.llmBatchSize);
    try {
      const summaries = await d.summarizeBatch(batch, config, d.fetch);
      for (const article of batch) {
        const summary = summaries.get(article.id);
        if (!summary) throw new Error("Missing article summary");
        article.summary = summary;
        completed.push(article);
      }
    } catch (error) {
      if (
        error instanceof Error && error.message === "LLM authentication failed"
      ) throw error;
      for (const article of batch) {
        errors.push({ source: article.title, message: safeMessage(error) });
        console.error(`Article failed: ${article.title}`);
      }
    }
  }

  if (completed.length === 0) throw new Error("No article could be summarized");

  for (const article of completed) {
    remember(state, article.id, article.feedUrl, article.url, d.now());
  }
  if (d.persistState) {
    await saveState(config.statePath, trimState(state, config));
  }

  const date = new Intl.DateTimeFormat("en-CA", { timeZone: config.timeZone })
    .format(d.now());
  console.error(
    `Digest generated: ${completed.length} summaries; ${feedFailures} feed failures; ${
      Date.now() - started
    }ms`,
  );
  return markdown(completed, date, errors);
}

type Dependencies = {
  fetch: typeof fetch;
  summarizeBatch: typeof summarizeBatch;
  now: () => Date;
  persistState: boolean;
};

async function fetchText(
  fetcher: typeof fetch,
  rawUrl: string,
  timeoutMs: number,
): Promise<string> {
  if (!isSafeUrl(rawUrl)) throw new Error("Unsafe feed URL");
  const response = await fetchExternal(fetcher, rawUrl, timeoutMs);
  if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
  return await response.text();
}

async function articleContent(
  article: Article,
  config: Config,
  fetcher: typeof fetch,
): Promise<string> {
  if (article.content.trim().length >= config.minFeedContentChars) {
    const content = article.content.trim();
    return limit(
      content.includes("<") ? textFromHtml(content) : content,
      config.maxInputChars,
    );
  }
  if (!article.url) return "";
  const response = await retry(() =>
    fetchExternal(fetcher, article.url, config.httpTimeoutMs)
  );
  if (!response.ok) throw new Error(`Article returned HTTP ${response.status}`);
  return limit(textFromHtml(await response.text()), config.maxInputChars);
}

export function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message.replace(/(?:sk-|Bearer\s+)[A-Za-z0-9_\-.]+/g, "[redacted]")
    .slice(0, 160);
}
