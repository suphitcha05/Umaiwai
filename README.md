---
title: MePlan AI
emoji: 🟢
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# MePlan AI (มีแผน)

Daily budget for people with irregular income and credit card debt. Prototype for U-Hackathon 2026. All money data in the demo is sample data.

Settings → Variables and secrets (add as Secrets):

| Name | Needed | What |
|---|---|---|
| `ELEVENLABS_API_KEY` | for voice | Speech to text. Without it the app still works, only the Speak button is off |
| `APP_PIN` | recommended | Locks voice, slip and /push. Share the app as `https://<space>.hf.space/?pin=YOUR_PIN` |
| `OWNER_NAME` | optional | Your name on bank slips (money in vs out) |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | optional | AI to split spoken items (otherwise code does it) |
| `NO_OCR` | optional | Set to `1` to turn off slip OCR on the server |
