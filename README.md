# Productify — Chrome Extension

> **Voice-powered AI assistant that converts speech to structured text, prompts, and actions — directly in your browser.**

---

## Features

| Feature | Details |
|---------|---------|
| 🎙️ Push-to-Talk + Toggle | Hold `Space` or click mic to record |
| 🤖 Dual STT | OpenAI Whisper (primary) + Google STT (alternative) |
| 🧠 12 Intents | Summarize, Prompt Gen, Tasks, Docs, Testing, Code Review, User Story, Explain, Translate, Email, Compare, Custom |
| 📄 Full Context | Extracts: selection, code blocks, headings, structured data, forms, domain detection |
| ⚡ Streaming Output | SSE word-by-word streaming from GPT-4o |
| 🌙 Dark/Light Theme | Glassmorphism design, smooth theme toggle |
| 📜 History | Last 50 outputs stored locally, searchable |
| ⭐ Prompt Library | Save, tag, search, and star reusable prompts |
| 🔗 Integrations | Notion, GitHub, Jira, Linear, Slack, Confluence, Webhook |
| ↩️ Refine | Follow-up voice or text command to iterate on output |
| 🔑 BYOK | All API keys encrypted with AES-256-GCM on your device |

---

## Getting Started

### 1. Load the Extension

```bash
# Open Chrome → chrome://extensions
# Enable Developer Mode (toggle top-right)
# Click "Load unpacked"
# Select: /path/to/productify/productify/
```

### 2. Start the Backend Server

```bash
cd server
npm install
cp .env.example .env
npm run dev
# Server starts at http://localhost:3000
```

### 3. Configure API Keys

On first launch, the onboarding flow will guide you through:
1. Granting microphone permission
2. Adding your **OpenAI API key** (required — for Whisper + GPT-4o)
3. Optionally adding a **Google STT key** for alternative provider

Or go to **Settings** in the side panel at any time.

---

## Project Structure

```
productify/                 ← Chrome Extension (load unpacked from here)
├── manifest.json            ← MV3 manifest
├── icons/                   ← Extension icons (16, 32, 48, 128)
├── sidepanel/               ← Main UI
│   ├── sidepanel.html/.js/.css
├── background/
│   ├── service_worker.js    ← Message router + API orchestrator
│   ├── intentClassifier.js  ← Local keyword pre-classifier  
│   └── outputRouter.js      ← Integration dispatch (7 services)
├── content/
│   └── contentScript.js     ← Page context extraction (10 signals)
├── offscreen/
│   └── audioProcessor.js    ← Mic capture + waveform via Web Audio API
├── lib/
│   ├── storage.js / crypto.js / markdown.js / i18n.js
├── styles/
│   ├── design-tokens.css / animations.css / themes.css
└── onboarding/              ← First-run 6-step tutorial

server/                      ← Node.js Express Backend
├── index.js                 ← Entry point
├── routes/
│   ├── transcribe.js        ← POST /transcribe (Whisper + Google STT)
│   ├── process.js           ← POST /process (GPT-4o SSE streaming)  
│   ├── intents.js           ← GET /intents
│   ├── library.js           ← /library CRUD
│   └── health.js            ← GET /health
├── services/
│   ├── intentService.js     ← LLM-based intent classification
│   └── contextEnricher.js   ← Context pre-processing
├── prompts/                 ← 12 LLM system prompt templates
└── middleware/              ← Auth, rate limiting, error handling
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘⇧P` | Open/close side panel |
| `⌘⇧Space` | Push-to-talk record |
| `Space` (hold, in panel) | Push-to-talk |
| `⌘⇧C` | Copy last output |
| `⌘⇧H` | Toggle history |
| `⌘⇧R` | Retry last command |
| `Esc` | Cancel recording |

---

## Supported Integrations

Connect via **Settings → Integrations**:

- **Notion** — Append to pages
- **GitHub** — Create issues
- **Jira** — Create/update tickets
- **Linear** — Create issues (GraphQL API)
- **Slack** — Post via Incoming Webhooks
- **Confluence** — Append to pages
- **Custom Webhook** — POST to any endpoint

---

## Security & Privacy

- **BYOK model** — You supply your own API keys
- **AES-256-GCM encryption** — Keys encrypted at rest in `chrome.storage.local`
- **Zero audio retention** — Audio blob destroyed immediately after transcription
- **Minimal permissions** — `activeTab`, `sidePanel`, `storage`, `offscreen` only
- **No analytics** — No usage data sent to any server

---

## Development

```bash
# Backend with hot reload
cd server && npm run dev

# Extension: just reload unpacked in chrome://extensions after changes
# (No build step needed — vanilla JS + CSS)
```

### Backend API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server status |
| `/transcribe` | POST | Audio → text (Whisper/Google STT) |
| `/process` | POST | Transcript → SSE-streamed output |
| `/process/refine` | POST | Refine previous output |
| `/intents` | GET | All 12 intent definitions |
| `/library` | GET/POST/PUT/DELETE | Prompt library CRUD |

---

## Roadmap

**v1.0 (current)** — Full local + cloud pipeline  
**v2.0** — Team shared library, wake word ("Hey Pilot"), cloud sync, analytics

---

*Built with ❤️ as a full-featured v1.0 product — not an MVP.*
