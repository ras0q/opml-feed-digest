import { assertEquals, assertThrows } from "@std/assert";
import { opmlToMarkdown } from "./main.ts";
import type { Config } from "./src/config.ts";
import { markdown } from "./src/markdown.ts";
import { parseFeed, parseOpml } from "./src/parsers.ts";
import { loadState, remember, saveState, trimState } from "./src/state.ts";
import { validateSummary } from "./src/summary.ts";
import { articleId, normalizeUrl } from "./src/util.ts";

Deno.test("OPML hierarchy and feed URLs are parsed", () => {
  const feeds = parseOpml(
    `<opml><body><outline text="Tech"><outline title="Blog" category="IACR" xmlUrl="https://example.com/feed"/></outline></body></opml>`,
  );
  assertEquals(feeds, [{
    name: "Blog",
    url: "https://example.com/feed",
    category: "IACR",
  }]);
});

Deno.test("RSS and Atom are parsed", () => {
  assertEquals(
    parseFeed(
      `<rss><channel><item><guid>a</guid><title>RSS</title><link>https://e.test/a</link><description>body</description></item></channel></rss>`,
      "https://e.test",
    )[0].title,
    "RSS",
  );
  assertEquals(
    parseFeed(
      `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>b</id><title>Atom</title><link href="https://e.test/b"/><summary>body</summary></entry></feed>`,
      "https://e.test",
    )[0].title,
    "Atom",
  );
});

Deno.test("URLs normalize and identifiers remain stable", async () => {
  assertEquals(
    normalizeUrl("https://EXAMPLE.com/a/?utm_source=x#top"),
    "https://example.com/a",
  );
  assertEquals(
    await articleId(undefined, "https://example.com/a", "f", "t"),
    await articleId(undefined, "https://example.com/a", "f", "t"),
  );
});

Deno.test("state persists and retention trims old entries", async () => {
  const directory = await Deno.makeTempDir();
  const path = `${directory}/state.json`;
  const state = { schemaVersion: 1 as const, entries: [] };
  remember(state, "new", "f", "u", new Date("2026-07-17T00:00:00Z"));
  remember(state, "old", "f", "u", new Date("2020-01-01T00:00:00Z"));
  await saveState(path, state);
  assertEquals((await loadState(path)).entries.length, 2);
  assertEquals(
    trimState(
      state,
      { stateRetentionDays: 90, stateMaxEntries: 1 },
      new Date("2026-07-17T00:00:00Z"),
    ).entries.map((entry) => entry.id),
    ["new"],
  );
});

Deno.test("LLM summaries require the decision schema", () => {
  assertEquals(
    validateSummary({
      priority: "high",
      headline: "見出し",
      relevance: "関連性",
      tags: ["Deno"],
      points: ["要点"],
    }).priority,
    "high",
  );
  assertThrows(() => validateSummary({ priority: "urgent" }));
});

Deno.test("Markdown prioritizes categories and emits a compact digest", () => {
  const result = markdown(
    [
      {
        feedName: "Blog",
        title: "Other post",
        url: "https://e.test/other",
        summary: {
          priority: "low",
          headline: "要旨",
          relevance: "理由",
          tags: ["Other Tag"],
          points: ["要点"],
        },
      },
      {
        category: "IACR",
        feedName: "IACR News",
        title: "IACR post",
        url: "https://e.test/iacr",
        summary: {
          priority: "high",
          headline: "重要な要旨",
          relevance: "理由",
          tags: ["Security"],
          points: ["要点"],
        },
      },
    ],
    "2026-07-17",
    [{ source: "Bad", message: "failed" }],
  );
  assertEquals(result.startsWith("# Feed Digest 2026-07-17"), true);
  assertEquals(result.indexOf("## IACR") < result.indexOf("## Others"), true);
  assertEquals(
    result.includes("🔴 [IACR post](https://e.test/iacr): 重要な要旨"),
    true,
  );
  assertEquals(result.includes("    - #Other-Tag"), true);
  assertEquals(result.includes("## Log"), true);
});

Deno.test("the run completes with partial article failures", async () => {
  const directory = await Deno.makeTempDir();
  const config = testConfig(directory);

  const feed =
    `<rss><channel><item><guid>one</guid><title>One</title><link>https://e.test/one</link><description>${
      "a".repeat(220)
    }</description></item><item><guid>two</guid><title>Two</title><link>https://e.test/two</link><description>${
      "b".repeat(220)
    }</description></item></channel></rss>`;
  await Deno.writeTextFile(
    `${directory}/feeds.opml`,
    `<opml><body><outline title="Blog" xmlUrl="https://e.test/feed"/></body></opml>`,
  );

  const result = await opmlToMarkdown(
    await Deno.readTextFile(config.opmlPath),
    config,
    {
      fetch: () => Promise.resolve(new Response(feed)),
      summarize: (content) => {
        if (content.startsWith("a")) throw new Error("summary failed");
        return Promise.resolve({
          priority: "medium",
          headline: "見出し",
          relevance: "関連性",
          tags: ["tag"],
          points: ["要点"],
        });
      },
    },
  );
  assertEquals(result.includes("## Log"), true);
  assertEquals(result.includes("- One: summary failed"), true);
  assertEquals((await loadState(config.statePath)).entries.length, 1);
});

Deno.test("the run creates no Issue when every article is already processed", async () => {
  const directory = await Deno.makeTempDir();
  const config = testConfig(directory);

  await Deno.writeTextFile(
    `${directory}/feeds.opml`,
    `<opml><body><outline title="Blog" xmlUrl="https://e.test/feed"/></body></opml>`,
  );

  const id = await articleId(
    "one",
    "https://e.test/one",
    "https://e.test/feed",
    "One",
  );
  await saveState(config.statePath, {
    schemaVersion: 1,
    entries: [{
      id,
      feedUrl: "https://e.test/feed",
      articleUrl: "https://e.test/one",
      processedAt: new Date().toISOString(),
    }],
  });

  const feed =
    `<rss><channel><item><guid>one</guid><title>One</title><link>https://e.test/one</link><description>body</description></item></channel></rss>`;
  const result = await opmlToMarkdown(
    await Deno.readTextFile(config.opmlPath),
    config,
    { fetch: () => Promise.resolve(new Response(feed)) },
  );
  assertEquals(result, "");
});

function testConfig(directory: string): Config {
  return {
    opmlPath: `${directory}/feeds.opml`,
    statePath: `${directory}/state.json`,
    timeZone: "Asia/Tokyo",
    maxArticles: 10,
    maxArticlesPerFeed: 5,
    maxInputChars: 1_000,
    httpTimeoutMs: 1_000,
    llmTimeoutMs: 1_000,
    llmMaxOutputTokens: 100,
    llmApiBaseUrl: "https://llm.test",
    llmApiKey: "secret",
    llmModel: "test",
    stateRetentionDays: 90,
    stateMaxEntries: 5_000,
  };
}
