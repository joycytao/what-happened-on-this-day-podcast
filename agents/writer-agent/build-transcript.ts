import type { ResearchDossier } from "../../src/contracts";
import { transcriptSchema } from "../../src/contracts";

export function buildTranscript(dossier: ResearchDossier) {
  const timelineSummary = dossier.timeline.join(" Then, ");
  const storyBeatOne = dossier.storyBeats[0];
  const storyBeatTwo = dossier.storyBeats[1];
  const storyBeatThree = dossier.storyBeats[2];

  return transcriptSchema.parse({
    opening: [
      "[SFX: time machine hum, 2s]",
      "[BGM: curious morning pulse, under narration]",
      `Good morning, time traveler. Before your backpack is even zipped, you are stepping into ${dossier.episodeDate}.`,
      `Today's mystery is ${dossier.chosenSubject}. Here is your first clue: ${dossier.chosenAngle}`,
      "Keep your ears open. In the next few minutes, you will hear how one moment can change the way you learn, play, or explore."
    ].join(" "),
    segments: [
      {
        heading: "Time Machine Hook",
        body: [
          "[SFX: soft bell chime]",
          "[Voice: excited whisper]",
          `Imagine you press a glowing button and land right beside ${dossier.chosenSubject}.`,
          "What do you notice first? Is it a sound, a crowd, a room, a screen, or someone's nervous face?",
          "[Action: look around your room and point to one thing you would take in a time machine]",
          `The big idea for you to track is this: ${dossier.episodeThesis}`,
          "That idea is our map. You will use it to follow the clues."
        ].join(" ")
      },
      {
        heading: "Narrative Drama",
        body: [
          "[SFX: clock ticks faster]",
          "[BGM: light suspense, under narration]",
          `First clue: ${storyBeatOne}`,
          `Then the pressure builds: ${storyBeatTwo}`,
          `Finally, the moment opens up: ${storyBeatThree}`,
          `The timeline gives you the trail: ${timelineSummary}.`,
          "If you were there, what question would you ask first? You might ask who was scared, who was excited, and who had to solve the next problem."
        ].join(" ")
      },
      {
        heading: "Scientific Deep-Dive",
        body: [
          "[SFX: magnifying glass sparkle]",
          "[Pause 1s]",
          "Now we slow down and investigate the hidden machinery of the story.",
          `Think of ${dossier.chosenSubject} like a school hallway between classes.`,
          "A hallway only works when doors, signs, and people help you move without getting lost.",
          `In the same way, this story works because ${dossier.episodeThesis}`,
          "That metaphor matters because you can test it yourself: when something is well designed, your brain spends less energy guessing and more energy learning.",
          "So when you hear a big historical event, do not only ask what happened. Ask how it helped people make their next move."
        ].join(" ")
      },
      {
        heading: "Modern World Twist",
        body: [
          "[SFX: phone tap, tablet swipe]",
          "[BGM: bright discovery beat, under narration]",
          `Here is where the story reaches your world: ${dossier.modernRelevance}`,
          "You can spot that connection when you open an app, visit a museum, follow a map, search for a file, or ask an adult a better question.",
          "Your daily life is full of tiny choices someone designed before you arrived.",
          "When you notice those choices, you stop being only a user. You become an investigator.",
          "What would you improve if you could redesign one tool you use every day?"
        ].join(" ")
      },
      {
        heading: "Outro & Mission",
        body: [
          "[SFX: time machine landing tone]",
          "Mission time.",
          `Today, your job is to explain ${dossier.chosenSubject} to someone at home in one sentence.`,
          "Use this frame: it mattered because it helped people do something in a new way.",
          "[Action: tap your fingers twice if you found the main clue]",
          "Then ask your listener what everyday object they think will become history someday.",
          "That question keeps your curiosity moving after the episode ends."
        ].join(" ")
      }
    ],
    closing: [
      "[BGM: warm closing theme, under narration]",
      "[SFX: time machine powers down]",
      "You made it back to today.",
      `Now you know why ${dossier.chosenSubject} is more than a date on a calendar.`,
      "It is a clue about how people solve problems, share ideas, and build the world you use every day.",
      "See you next time, time traveler."
    ].join(" "),
    estimatedDurationMin: 6,
    ttsNotes: [
      `Pronunciation: read "${dossier.chosenSubject}" slowly and clearly on first mention.`,
      "Phonetic support: pause briefly before dates and proper nouns.",
      "Humanizer pass marker: reviewed for natural spoken phrasing, short sentences, and read-aloud flow."
    ]
  });
}
