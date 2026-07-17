import { mkdir, readFile, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import type { Config } from "./config.ts";

export type State = { schemaVersion: 1; entries: StateEntry[] };
export type StateEntry = {
  id: string;
  feedUrl: string;
  articleUrl: string;
  processedAt: string;
};

export async function loadState(path: string): Promise<State> {
  try {
    const state = JSON.parse(await readFile(path, "utf8"));
    if (state.schemaVersion !== 1 || !Array.isArray(state.entries)) {
      throw new Error("Unsupported state schema");
    }
    return state;
  } catch (error) {
    if (
      typeof error === "object" && error !== null && "code" in error &&
      error.code === "ENOENT"
    ) {
      return { schemaVersion: 1, entries: [] };
    }
    throw error;
  }
}

export function remember(
  state: State,
  id: string,
  feedUrl: string,
  articleUrl: string,
  now: Date,
): void {
  state.entries.push({
    id,
    feedUrl,
    articleUrl,
    processedAt: now.toISOString(),
  });
}

export function trimState(
  state: State,
  config: Pick<Config, "stateRetentionDays" | "stateMaxEntries">,
  now = new Date(),
): State {
  const minimum = now.getTime() - config.stateRetentionDays * 86_400_000;
  state.entries = state.entries.filter((entry) =>
    Date.parse(entry.processedAt) >= minimum
  ).slice(-config.stateMaxEntries);
  return state;
}

export async function saveState(path: string, state: State): Promise<void> {
  await mkdir(nodePath.dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
}
