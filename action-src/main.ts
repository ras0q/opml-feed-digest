import * as cache from "@actions/cache";
import * as core from "@actions/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { opmlToMarkdown } from "../main.ts";
import { loadConfig } from "../src/config.ts";
import { callerPath } from "./paths.ts";

try {
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) throw new Error("GITHUB_WORKSPACE is required");

  const runId = process.env.GITHUB_RUN_ID;
  if (!runId) throw new Error("GITHUB_RUN_ID is required");

  const opmlPath = callerPath(
    workspace,
    core.getInput("opml-path", { required: true }),
    "opml-path",
  );
  const statePath = callerPath(
    workspace,
    core.getInput("state-path"),
    "state-path",
  );
  const outputPath = callerPath(
    workspace,
    core.getInput("output-path"),
    "output-path",
  );
  const cacheKeyPrefix = core.getInput("cache-key-prefix");
  const cacheKey = `${cacheKeyPrefix}${runId}`;

  await mkdir(path.dirname(statePath), { recursive: true });
  const cacheKeyHit = await cache.restoreCache([statePath], cacheKey, [
    cacheKeyPrefix,
  ]);
  core.info(
    cacheKeyHit
      ? `Restored state cache: ${cacheKeyHit}`
      : "No state cache found",
  );

  process.env.LLM_API_KEY = core.getInput("llm-api-key", { required: true });
  process.env.LLM_API_BASE_URL = core.getInput("llm-api-base-url", {
    required: true,
  });
  process.env.LLM_MODEL = core.getInput("llm-model");
  process.env.OPML_PATH = opmlPath;
  process.env.STATE_PATH = statePath;

  const markdown = await opmlToMarkdown(
    await readFile(opmlPath, "utf8"),
    loadConfig(),
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown);

  const hasNewArticles = markdown.trim().length > 0;
  core.setOutput("has-new-articles", hasNewArticles);
  core.saveState("cache-key", cacheKey);
  core.saveState("state-path", statePath);
  core.saveState("save-state", hasNewArticles);
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error));
}
