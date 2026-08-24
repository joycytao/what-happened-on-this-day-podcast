# PRODUCTION SKILL: Local AI Voice Engine & Multitrack Sound SOP

> **Version:** 3.6  
> **Prerequisite:** Inherits all rules from `COMMON_SKILL.md`  
> **Primary Engine:** Local Offline **Qwen3-TTS (1.7B CustomVoice / 0.6B)**  

---

## 1. Qwen3-TTS Voice Engine Configuration
* **Primary Model (`Qwen3-TTS 1.7B`):** Mandatory for full episode rendering (4–8 GB VRAM required).
* **Fallback Model (`Qwen3-TTS 0.6B`):** Rapid prototyping or CPU/edge execution.
* **Voice Profile Locking:** Use 3–5s clean, high-energy reference audio. Lock the `seed` parameter across all episodes for 100% voice IP consistency.
* **Audio In-Filling / Patching:** Use Qwen3-TTS localized re-synthesis to repair single mispronunciations without regenerating full multi-minute tracks.

---

## 2. Acoustic Masking & Sound Design Rules
* **Acoustic Masking:** Overlay sound effects (`[SFX]`) directly above AI voice transition boundaries to obscure synthetic artifacts or unnatural speech tails.
* **Frequency & EQ Shaping:** Boost mid-bass (150–300 Hz) for voice warmth; apply a sharp high-cut above 16 kHz to eliminate digital harshness.
* **Mastering Loudness Standard:** Export final multitrack mix normalized to **-16 LUFS** with a maximum true peak limit of -1.0 dB.

---

## 3. Producer Quality Assurance Checklist
- [ ] Voice prompt and inference seed locked for character consistency.
- [ ] SFX/BGM transitions aligned with script audio markup.
- [ ] Acoustic masking placed over any synthetic speech cuts.
- [ ] Audio patched/re-synthesized for mispronounced terms.
- [ ] Final export normalized to -16 LUFS (-1.0 dB True Peak).
