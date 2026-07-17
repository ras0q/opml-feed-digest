import { readFile } from "node:fs/promises";
import { opmlToMarkdown, safeMessage } from "./main.ts";
import { loadConfig } from "./src/config.ts";
import type { Summary } from "./src/summary.ts";

const noLlm = Deno.args.includes("--no-llm");
const unknownArgument = Deno.args.find((argument) => argument !== "--no-llm");

try {
  if (unknownArgument) {
    throw new Error(
      `Unknown argument: ${unknownArgument}. Usage: deno task digest [--no-llm]`,
    );
  }

  const config = loadConfig({ requireLlm: !noLlm });
  const opml = await readFile(config.opmlPath, "utf8");
  const digest = await opmlToMarkdown(
    opml,
    config,
    noLlm
      ? {
        persistState: false,
        summarizeBatch: (articles) =>
          Promise.resolve(
            new Map(
              articles.map((article) => [article.id, testSummary(article)]),
            ),
          ),
      }
      : {},
  );

  if (digest) await Deno.stdout.write(new TextEncoder().encode(digest));
} catch (error) {
  console.error(`News digest failed: ${safeMessage(error)}`);
  Deno.exit(1);
}

function testSummary(article: { title: string }): Summary {
  return {
    priority: "low",
    headline: "LLM API を呼び出さずに確認しました",
    relevance: "フィード取得・本文抽出のテスト結果です",
    tags: ["no-llm"],
    points: [article.title],
  };
}
