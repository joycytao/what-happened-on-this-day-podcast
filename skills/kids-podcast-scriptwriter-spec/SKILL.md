# SCRIPTWRITER SKILL: Kids Science Podcast Writing & Markup SOP

> **Version:** 3.6  
> **Prerequisite:** Inherits all rules from `COMMON_SKILL.md`  
> **Primary Goal:** Transform raw scientific facts into high-engagement, audio-first scripts with prosody markup and reference-cloned styles.

---

## 1. Audio Markup Tagging Syntax
Scriptwriters must insert explicit audio cues for the AI Producer and Qwen3-TTS engine:

* `[SFX: <Description>]` – Scene-setting or acoustic masking cue (e.g., `[SFX: Time machine engine rev]`).
* `[BGM: <Mood/Action>]` – Background music mood shift (e.g., `[BGM: Suspenseful mystery synth]`).
* `[Voice: <Emotion/Speed>]` – Prosody guidance (e.g., `[Voice: Excited whisper]`, `[Voice: Fast and urgent]`).
* `[Pause: <Duration>]` – Natural breathing control (e.g., `[Pause 2s]`).
* `[Action: <Physical Prompt>]` – Interactive listener reset (e.g., `[Action: Touch your nose]`).

---

## 2. Reference Podcast Deconstruction Protocol (Benchmarking SOP)
Before writing any new script, the Scriptwriter and AI Writer MUST analyze provided reference podcast audio/transcripts using this mandatory 4-step feature extraction framework:

### Mandatory Feature Extraction Checklist:
1. **The 15-Second Hook Formula:**
   * *Analyze:* Extract the exact opening mechanics (e.g., teaser sound bite, high-stakes question, or dramatic quote).
   * *Rule:* Structure Sentence 1 as a mystery or counter-intuitive fact that demands immediate resolution.

2. **SFX & Music Transition Density:**
   * *Analyze:* Count background sound effects (`[SFX]`) and music transitions (`[BGM]`) per minute in the reference.
   * *Rule:* Enforce target audio cue density (e.g., minimum 1 `[SFX]` or `[BGM]` change every 45 seconds).

3. **Attention Reset Rhythm:**
   * *Analyze:* Identify exact timestamps where the reference host uses rhetorical questions, dramatic pauses, or physical prompts.
   * *Rule:* Insert at least 1 listener action prompt (`[Action]`) or direct question every 3 minutes to break auditory fatigue.

4. **Tone & Sentence Cadence:**
   * *Analyze:* Calculate average sentence word count and frequency of second-person pronouns ("you / your").
   * *Rule:* Keep 70%+ of sentences under 15 words and maintain a 1-on-1 direct dialogue ratio (mention "you" >= 10 times per episode).

### Benchmarking Enforcement Workflow:
* **Step 1:** Transcribe reference podcast audio using Whisper or speech-to-text API with timestamps.
* **Step 2:** Fill out the 4-step "Reference Analysis Matrix".
* **Step 3:** Generate the script enforcing the extracted hook, sentence cadence, and interaction parameters.
* **Step 4:** Run QA Audit: Verify script metrics against the Reference Benchmark before passing to TTS synthesis.

---

## 3. Phonetic Preprocessing & Lexicon Tagging
To prevent AI voice pronunciation errors in Qwen3-TTS:
* Replace ambiguous homophones, proper nouns, and complex scientific terms with explicit Pinyin/Zhuyin annotations.
* Spell out all numbers and mathematical symbols (e.g., write "百分之五十" instead of "50%").

---

## 4. Scriptwriter Quality Assurance Checklist
- [ ] **Benchmark Alignment:** Was the script structured using the 4-Step Reference Deconstruction Protocol?
- [ ] **Duration Standard:** Script length is paced for 5-8 minutes.
- [ ] **15-Second Hook:** Hook establishes a clear mystery within the first 15 seconds.
- [ ] **Concrete Metaphor:** Contains at least 1 vivid everyday metaphor explaining the core science in Module 3.
- [ ] **Attention Resets:** Contains at least 2 listener action prompts (`[Action]`) spaced every 3 minutes.
- [ ] **Phonetic Readiness:** All technical terms and homophones are phonetically tagged.

<!-- Exported for User Download -->
