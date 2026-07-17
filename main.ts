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
type ContentSource = "feed" | "article page";

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

  console.error(
    `News digest started: max articles=${config.maxArticles}, per feed=${config.maxArticlesPerFeed}, feed content threshold=${config.minFeedContentChars} chars`,
  );
  const feeds = parseOpml(opml);
  const state = await loadState(config.statePath);
  console.error(
    `Loaded ${feeds.length} feeds; restored ${state.entries.length} state entries`,
  );

  const articles: Article[] = [];
  let feedFailures = 0;
  for (const feed of feeds) {
    try {
      console.error(`Fetching feed: ${feed.name}`);
      const xml = await retry(() =>
        fetchText(d.fetch, feed.url, config.httpTimeoutMs)
      );
      const parsed = parseFeed(xml, feed.url).slice(
        0,
        config.maxArticlesPerFeed,
      );
      let skipped = 0;
      for (const item of parsed) {
        const id = await articleId(
          item.guid,
          item.url,
          feed.url,
          item.title,
          item.published,
        );
        if (state.entries.some((entry) => entry.id === id)) {
          skipped++;
          continue;
        }
        articles.push({
          ...item,
          id,
          feedUrl: feed.url,
          feedName: feed.name,
          category: feed.category,
        });
      }
      console.error(
        `Feed parsed: ${feed.name}; items=${parsed.length}, new=${
          parsed.length - skipped
        }, processed=${skipped}`,
      );
    } catch (error) {
      feedFailures++;
      const message = safeMessage(error);
      errors.push({ source: feed.name, message });
      console.error(`Feed failed: ${feed.name}; ${message}`);
    }
  }

  const selected = articles.slice(0, config.maxArticles);
  console.error(
    `Article selection: candidates=${articles.length}, selected=${selected.length}, limit=${config.maxArticles}`,
  );
  if (selected.length === 0) {
    console.error("No new articles; digest generation skipped");
    return "";
  }

  const ready: Article[] = [];
  for (const [index, article] of selected.entries()) {
    try {
      console.error(
        `Extracting article ${
          index + 1
        }/${selected.length}: ${article.feedName}; ${article.title}`,
      );
      const { content, source } = await articleContent(
        article,
        config,
        d.fetch,
      );
      if (!content) throw new Error("Article content is unavailable");
      article.content = content;
      ready.push(article);
      console.error(
        `Article ready: ${article.title}; source=${source}, chars=${content.length}`,
      );
    } catch (error) {
      const message = safeMessage(error);
      errors.push({ source: article.title, message });
      console.error(`Article failed: ${article.title}; ${message}`);
    }
  }

  const completed: Article[] = [];
  for (let index = 0; index < ready.length; index += config.llmBatchSize) {
    const batch = ready.slice(index, index + config.llmBatchSize);
    const batchNumber = index / config.llmBatchSize + 1;
    const batchCount = Math.ceil(ready.length / config.llmBatchSize);
    try {
      console.error(
        `Summarizing batch ${batchNumber}/${batchCount}: articles=${batch.length}`,
      );
      const summaries = await d.summarizeBatch(batch, config, d.fetch);
      for (const article of batch) {
        const summary = summaries.get(article.id);
        if (!summary) throw new Error("Missing article summary");
        article.summary = summary;
        completed.push(article);
      }
      console.error(`Summary batch complete: ${batchNumber}/${batchCount}`);
    } catch (error) {
      if (
        error instanceof Error && error.message === "LLM authentication failed"
      ) throw error;
      const message = safeMessage(error);
      console.error(
        `Summary batch failed: ${batchNumber}/${batchCount}; ${message}`,
      );
      for (const article of batch) {
        errors.push({ source: article.title, message });
        console.error(`Article failed: ${article.title}; ${message}`);
      }
    }
  }

  if (completed.length === 0) throw new Error("No article could be summarized");

  for (const article of completed) {
    remember(state, article.id, article.feedUrl, article.url, d.now());
  }
  if (d.persistState) {
    const entriesBeforeTrim = state.entries.length;
    const trimmed = trimState(state, config);
    console.error(
      `Saving state: entries=${trimmed.entries.length}, removed=${
        entriesBeforeTrim - trimmed.entries.length
      }`,
    );
    await saveState(config.statePath, trimmed);
  } else {
    console.error("State persistence skipped");
  }

  const date = new Intl.DateTimeFormat("en-CA", { timeZone: config.timeZone })
    .format(d.now());
  console.error(
    `Digest generated: summaries=${completed.length}, article failures=${
      selected.length - ready.length
    }, summary failures=${
      ready.length - completed.length
    }, feed failures=${feedFailures}, duration=${Date.now() - started}ms`,
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
): Promise<{ content: string; source: ContentSource }> {
  if (article.content.trim().length >= config.minFeedContentChars) {
    const content = article.content.trim();
    return {
      content: limit(
        content.includes("<") ? textFromHtml(content) : content,
        config.maxInputChars,
      ),
      source: "feed",
    };
  }
  if (!article.url) return { content: "", source: "article page" };
  const response = await retry(() =>
    fetchExternal(fetcher, article.url, config.httpTimeoutMs)
  );
  if (!response.ok) throw new Error(`Article returned HTTP ${response.status}`);
  return {
    content: limit(textFromHtml(await response.text()), config.maxInputChars),
    source: "article page",
  };
}

export function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message.replace(/(?:sk-|Bearer\s+)[A-Za-z0-9_\-.]+/g, "[redacted]")
    .slice(0, 160);
}
