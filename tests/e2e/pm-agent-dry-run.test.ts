import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runEpisodePipeline } from "../../agents/pm-agent";

describe("pm dry run", () => {
  it("runs the full pm dry run to review", async () => {
    const result = await runEpisodePipeline({
      brief: {
        date: "2026-08-19",
        workingTitle: "A Museum Opens"
      }
    });

    await fs.rm(path.join(result.runDir, "audio", "sfx-manifest.json"), { force: true });

    expect(result.runDir).toContain("runs/");
    expect(result.finalStage).toBe("review");
  });
});
