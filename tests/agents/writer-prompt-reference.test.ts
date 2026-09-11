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
    const sopV3 = await fs.readFile(
      "prompts/writer/references/transcript-sop-v3-natural-tts.md",
      "utf8"
    );

    expect(systemPrompt).toContain("podcast script, not an article");
    expect(systemPrompt).toContain("prompts/writer/references/podcast-script-writer-guidelines.md");
    expect(systemPrompt).toContain("prompts/writer/references/student-podcast-script-guidelines.md");
    expect(systemPrompt).toContain("prompts/writer/references/transcript-sop-v3-natural-tts.md");
    expect(generalGuideline).toContain("Writing for the ear");
    expect(generalGuideline).toContain("Here is your first clue");
    expect(generalGuideline).toContain("October second, twenty twenty-six");
    expect(studentGuideline).toContain("7-15");
    expect(studentGuideline).toContain("SFX");
    expect(studentGuideline).toContain("3.5-5 minutes");
    expect(sopV3).toContain("zero banned signposting transitions");
    expect(sopV3).toContain("[Pause: duration]");
    expect(sopV3).toContain("one concrete science principle");
    expect(sopV3).toContain("Schulz [Voice: pronounced as Shults]");
  });
});
