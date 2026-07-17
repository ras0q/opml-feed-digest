import type { Summary } from "./summary.ts";

type DigestArticle = {
  category?: string;
  feedName: string;
  title: string;
  url: string;
  published?: string;
  summary?: Summary;
};

type DigestError = { source: string; message: string };

export function markdown(
  articles: DigestArticle[],
  date: string,
  errors: DigestError[],
): string {
  const lines = [`# Feed Digest ${date}`];
  const categories = new Map<string, Map<string, DigestArticle[]>>();

  for (const article of articles) {
    const category = article.category ?? "Others";
    const feeds = categories.get(category) ??
      new Map<string, DigestArticle[]>();
    const items = feeds.get(article.feedName) ?? [];

    items.push(article);
    feeds.set(article.feedName, items);
    categories.set(category, feeds);
  }

  for (const [category, feeds] of orderedCategories(categories)) {
    lines.push("", `## ${category}`);

    for (const [feedName, items] of feeds) {
      lines.push("", `### ${feedName}`);

      for (const article of items.sort(byPublishedDate)) {
        const summary = article.summary!;
        lines.push(
          "",
          `- ${
            priority(summary.priority)
          } [${article.title}](${article.url}): ${summary.headline}`,
          ...summary.points.map((point) => `    - ${point}`),
          `    - ${summary.tags.map(tag).join(" ")}`,
        );
      }
    }
  }

  lines.push("", "## Log", "", "<details>", "");
  lines.push(`<summary>Errors (${errors.length})</summary>`, "");
  lines.push(
    ...(errors.length
      ? errors.map((error) => `- ${error.source}: ${error.message}`)
      : ["- None"]),
  );
  lines.push("", "</details>");

  return `${lines.join("\n")}\n`;
}

function priority(value: Summary["priority"]): string {
  return ({ high: "🔴", medium: "🟡", low: "⚪" })[value];
}

function orderedCategories(
  categories: Map<string, Map<string, DigestArticle[]>>,
): [string, Map<string, DigestArticle[]>][] {
  return [...categories].sort(([left], [right]) => {
    if (left === "Others") return 1;
    if (right === "Others") return -1;
    return 0;
  });
}

function byPublishedDate(left: DigestArticle, right: DigestArticle): number {
  return (right.published ?? "").localeCompare(left.published ?? "");
}

function tag(value: string): string {
  return `#${value.trim().replace(/^#/, "").replace(/\s+/g, "-")}`;
}
