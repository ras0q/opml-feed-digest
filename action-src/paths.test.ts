import { assertEquals, assertThrows } from "@std/assert";
import { callerPath } from "./paths.ts";

Deno.test("callerPath resolves paths inside the calling workspace", () => {
  assertEquals(
    callerPath("/workspace", "state/processed.json", "state-path"),
    "/workspace/state/processed.json",
  );
});

Deno.test("callerPath rejects paths outside the calling workspace", () => {
  assertThrows(() => callerPath("/workspace", "../secret", "state-path"));
});
