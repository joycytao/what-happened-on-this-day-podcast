import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import { resolveRepoPaths } from "../../src/lib/fs-paths";
import { createLogger } from "../../src/lib/logger";
import { parseCliArgs } from "../../src/lib/cli";

describe("repo foundation", () => {
  it("resolves the canonical workspace directories", () => {
    const paths = resolveRepoPaths("/tmp/podcast-repo");

    expect(paths.repoRoot).toBe("/tmp/podcast-repo");
    expect(paths.agentsDir).toBe("/tmp/podcast-repo/agents");
    expect(paths.contractsDir).toBe("/tmp/podcast-repo/contracts");
    expect(paths.configsDir).toBe("/tmp/podcast-repo/configs");
    expect(paths.promptsDir).toBe("/tmp/podcast-repo/prompts");
    expect(paths.runsDir).toBe("/tmp/podcast-repo/runs");
  });

  it("creates a scoped logger with standard methods", () => {
    const logger = createLogger("pm-agent");

    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("parses a command name and string options", () => {
    expect(
      parseCliArgs([
        "node",
        "pm-agent",
        "pickup-episode",
        "--issue-number",
        "14",
        "--dry-run"
      ])
    ).toEqual({
      command: "pickup-episode",
      options: {
        "issue-number": "14",
        "dry-run": true
      }
    });
  });

  it("exposes role-agent scheduled runner scripts", async () => {
    const packageJson = JSON.parse(await fs.readFile(new URL("../../package.json", import.meta.url), "utf8"));

    expect(packageJson.scripts).toMatchObject({
      "research-agent": "node --import tsx ./agents/research-agent/index.ts",
      "writer-agent": "node --import tsx ./agents/writer-agent/index.ts",
      "producer-agent": "node --import tsx ./agents/producer-agent/index.ts"
    });
  });
});
