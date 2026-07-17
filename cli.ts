import { readFile } from "node:fs/promises";
import { opmlToMarkdown, safeMessage } from "./main.ts";
import { loadConfig } from "./src/config.ts";

try {
  const config = loadConfig();
  const opml = await readFile(config.opmlPath, "utf8");
  const digest = await opmlToMarkdown(opml, config);

  if (digest) await Deno.stdout.write(new TextEncoder().encode(digest));
} catch (error) {
  console.error(`News digest failed: ${safeMessage(error)}`);
  Deno.exit(1);
}
