import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";

describe("writer prompt references", () => {
  it("requires podcast script writing references", async () => {
    const systemPrompt = await fs.readFile("prompts/writer/system.md", "utf8");
    const generalGuideline = await fs.readFile(
      "prompts/writer/references/podcast-script-writer-guidelines.md",
      "utf8"
    );
    const studentGuideline = await fs.readFile(
      "prompts/writer/references/student-podcast-script-guidelines.md",
      "utf8"
    );

    expect(systemPrompt).toContain("podcast script, not an article");
    expect(systemPrompt).toContain("prompts/writer/references/podcast-script-writer-guidelines.md");
    expect(systemPrompt).toContain("prompts/writer/references/student-podcast-script-guidelines.md");
    expect(generalGuideline).toContain("Writing for the ear");
    expect(studentGuideline).toContain("7-15");
    expect(studentGuideline).toContain("SFX");
  });
});
