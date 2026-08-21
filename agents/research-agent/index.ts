import fs from "node:fs/promises";
import path from "node:path";
import type { EpisodeRequest } from "../../src/contracts";
import { researchDossierSchema, researchReferencesSchema, type ResearchDossier } from "../../src/contracts";
import { selectBestCandidate } from "./select-candidate";

export async function runResearchAgent(request: EpisodeRequest, options: { runDir?: string } = {}) {
  const candidate = selectBestCandidate([
    {
      subject: "The launch of Windows 95",
      entityType: "event" as const,
      angle: "How a software launch helped make personal computers feel easier for everyday families",
      thesis: "A computer interface can change how people learn, work, and explore at home.",
      timeline: [
        "August 24, 1995: Microsoft launches Windows 95",
        "1995: Windows 95 introduces the Start button, taskbar, desktop shortcuts, and plug and play support",
        "First five weeks after launch: Microsoft reports 7 million copies sold"
      ],
      storyBeats: [
        "Families and computer stores wait for a midnight software launch",
        "A new Start button and taskbar make computers feel more approachable",
        "The launch shows how software can change daily habits"
      ],
      modernRelevance: "Modern phones, tablets, and laptops still depend on interface choices that help people find apps, files, and settings.",
      sources: [
        {
          title: "Microsoft Stories: Launch of Windows 95",
          url: "https://news.microsoft.com/announcement/launch-of-windows-95/",
          sourceType: "official" as const
        },
        {
          title: "Computer History Museum: August 24, Microsoft Ships Windows 95",
          url: "https://www.computerhistory.org/tdih/august/24/",
          sourceType: "archive" as const
        }
      ],
      safetyNotes: []
    }
  ]);

  const dossier = researchDossierSchema.parse({
    episodeDate: request.date,
    chosenSubject: candidate.subject,
    entityType: candidate.entityType,
    chosenAngle: candidate.angle,
    episodeThesis: candidate.thesis,
    timeline: candidate.timeline,
    storyBeats: candidate.storyBeats,
    modernRelevance: candidate.modernRelevance,
    sources: candidate.sources,
    safetyNotes: candidate.safetyNotes
  });

  if (options.runDir) {
    await persistResearchArtifacts(dossier, options.runDir);
  }

  return dossier;
}

async function persistResearchArtifacts(dossier: ResearchDossier, runDir: string) {
  const referencesDir = path.join(runDir, "references");
  const references = buildResearchReferences(dossier);

  await fs.mkdir(referencesDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "research-dossier.json"), `${JSON.stringify(dossier, null, 2)}\n`, "utf8");
  await fs.writeFile(
    path.join(referencesDir, "research-references.json"),
    `${JSON.stringify(references, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(path.join(referencesDir, "README.md"), buildReferenceReadme(references), "utf8");
}

function buildResearchReferences(dossier: ResearchDossier) {
  return researchReferencesSchema.parse({
    episodeDate: dossier.episodeDate,
    chosenSubject: dossier.chosenSubject,
    items: dossier.sources.map((source, index) => ({
      id: `ref-${index + 1}`,
      summary: buildSourceBackedSummary(dossier, source.title, source.url),
      source
    }))
  });
}

function buildSourceBackedSummary(dossier: ResearchDossier, sourceTitle: string, sourceUrl: string) {
  if (sourceTitle === "Microsoft Stories: Launch of Windows 95") {
    return [
      `${sourceTitle} (${sourceUrl}) states that Windows 95 launched on August 24, 1995.`,
      "The source says the launch included midnight store openings and lines of customers worldwide.",
      "It also describes user-facing features such as the Start button, taskbar, Recycle Bin, desktop shortcuts, long file names, and plug and play support.",
      "Microsoft reports in this source that Windows 95 sold 7 million copies in its first five weeks."
    ].join(" ");
  }

  if (sourceTitle === "Computer History Museum: August 24, Microsoft Ships Windows 95") {
    return [
      `${sourceTitle} (${sourceUrl}) identifies August 24, 1995 as the date Microsoft shipped Windows 95.`,
      "The source describes the launch campaign as unusually large for computing history and says sales exceeded predictions.",
      "It connects the Windows 95 launch to the broader history of personal computing."
    ].join(" ");
  }

  return [
    `${sourceTitle} (${sourceUrl}) is cited for the research dossier on ${dossier.chosenSubject}.`,
    `The reference supports the selected angle: ${dossier.chosenAngle}.`,
    `Facts from this source must be checked against the source before they are used in narration.`
  ].join(" ");
}

function buildReferenceReadme(references: ReturnType<typeof buildResearchReferences>) {
  return `${[
    "# Research references",
    "",
    `Episode date: ${references.episodeDate}`,
    `Chosen subject: ${references.chosenSubject}`,
    "",
    ...references.items.flatMap((item) => [
      `## ${item.id}`,
      "",
      item.summary,
      "",
      `Source: ${item.source.title}`,
      `URL: ${item.source.url}`,
      `Source type: ${item.source.sourceType}`,
      ""
    ])
  ].join("\n").trim()}\n`;
}
