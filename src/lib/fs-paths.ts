import path from "node:path";

export function resolveRepoPaths(root = process.cwd()) {
  return {
    repoRoot: root,
    agentsDir: path.join(root, "agents"),
    contractsDir: path.join(root, "contracts"),
    configsDir: path.join(root, "configs"),
    promptsDir: path.join(root, "prompts"),
    runsDir: path.join(root, "runs")
  };
}
