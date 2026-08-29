import { describe, expect, it } from "vitest";
import {
  parseTranscriptMarkdown,
  serializeTranscriptMarkdown,
  type Transcript
} from "../../src/contracts";

const fiveModuleTranscript: Transcript = {
  opening: [
    "[SFX: time machine hum, 2s]",
    "[Voice: excited whisper]",
    "Good morning, time traveler. Are you ready?"
  ].join("\n"),
  segments: [
    {
      heading: "Time Machine Hook",
      body: "You hear a bell. [SFX: soft bell chime]\n[Action: tap your fingers twice]"
    },
    {
      heading: "Narrative Drama",
      body: "A crowd waits outside a store. [BGM: curious light pulse, under narration]"
    },
    {
      heading: "Scientific Deep-Dive",
      body: "Think of an interface like a school hallway. [Pause 1s]"
    },
    {
      heading: "Modern World Twist",
      body: "Your tablet still uses ideas from that moment. [SFX: whoosh, 1.5s]"
    },
    {
      heading: "Outro & Mission",
      body: "Your mission is to ask one grown-up about their first computer."
    }
  ],
  closing: "Back to today. [SFX: time machine powers down]",
  estimatedDurationMin: 6,
  ttsNotes: [
    "Pronunciation: Windows 95 as WIN-dohz ninety-five.",
    "Keep a bright pace after the opening."
  ]
};

describe("transcript markdown contract", () => {
  it("serializes and parses a five-module transcript with cues and TTS notes", () => {
    const markdown = serializeTranscriptMarkdown(fiveModuleTranscript);
    const parsed = parseTranscriptMarkdown(markdown);

    expect(parsed).toEqual(fiveModuleTranscript);
    expect(markdown).toContain("## Time Machine Hook");
    expect(markdown).toContain("[SFX: time machine hum, 2s]");
    expect(markdown).toContain("[BGM: curious light pulse, under narration]");
    expect(markdown).toContain("[Voice: excited whisper]");
    expect(markdown).toContain("[Pause 1s]");
    expect(markdown).toContain("[Action: tap your fingers twice]");
    expect(markdown).toContain("Pronunciation: Windows 95 as WIN-dohz ninety-five.");
  });

  it("keeps parse serialize parse stable", () => {
    const once = parseTranscriptMarkdown(serializeTranscriptMarkdown(fiveModuleTranscript));
    const twice = parseTranscriptMarkdown(serializeTranscriptMarkdown(once));

    expect(twice).toEqual(once);
  });

  it("fails clearly when required transcript sections are missing", () => {
    expect(() =>
      parseTranscriptMarkdown("# Transcript\n\nEstimated duration: 5 minutes\n\n## Opening\n\nHello.\n")
    ).toThrow("Transcript markdown is missing required section: Closing");
  });

  it("fails clearly when estimated duration is missing", () => {
    expect(() =>
      parseTranscriptMarkdown([
        "# Transcript",
        "",
        "## Opening",
        "",
        "Hello.",
        "",
        "## Time Machine Hook",
        "",
        "A hook.",
        "",
        "## Closing",
        "",
        "Bye.",
        "",
        "## TTS Notes",
        "",
        "- Pronunciation: test"
      ].join("\n"))
    ).toThrow("Transcript markdown is missing estimated duration");
  });

  it("fails clearly when markdown cannot satisfy the transcript schema", () => {
    expect(() =>
      parseTranscriptMarkdown([
        "# Transcript",
        "",
        "Estimated duration: 12 minutes",
        "",
        "## Opening",
        "",
        "Hello.",
        "",
        "## Time Machine Hook",
        "",
        "A hook.",
        "",
        "## Closing",
        "",
        "Bye.",
        "",
        "## TTS Notes",
        "",
        "- Pronunciation: test"
      ].join("\n"))
    ).toThrow("Transcript markdown failed schema validation");
  });
});
