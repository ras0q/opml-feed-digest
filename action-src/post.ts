import * as cache from "@actions/cache";
import * as core from "@actions/core";

try {
  if (core.getState("save-state") !== "true") {
    core.info("No new articles; skipping state cache save");
  } else {
    const statePath = core.getState("state-path");
    const cacheKey = core.getState("cache-key");
    await cache.saveCache([statePath], cacheKey);
    core.info(`Saved state cache: ${cacheKey}`);
  }
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error));
}
