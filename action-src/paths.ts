import path from "node:path";

export function callerPath(
  workspace: string,
  input: string,
  name: string,
): string {
  const root = path.resolve(workspace);
  const resolved = path.resolve(root, input);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${name} must stay within GITHUB_WORKSPACE`);
  }

  return resolved;
}
