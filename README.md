# HybridNote AI

**Paste a document. Get the gist on-device in a blink — then the full breakdown from the cloud.**

HybridNote AI is a web app built for the **#BuildHybridAI 2026** hackathon. It analyzes documents (meeting notes, articles, email threads, contracts) with **hybrid inference** powered by **Firebase AI Logic**:

- **⚡ Instant analysis — on-device first.** A summary + key points produced by **Gemini Nano** running locally in Chrome (via the Prompt API), routed by Firebase AI Logic's `PREFER_ON_DEVICE` hybrid mode. Private by architecture, works offline, costs $0.00.
- **☁ Deep analysis — cloud, structured.** A cloud Gemini model returns an executive summary, **action items with owners and deadlines, decisions, risks**, and **3 study flashcards** — as schema-validated JSON (`ONLY_IN_CLOUD` + `responseSchema`).
- **A hybrid meter that never lies.** Every response from Firebase AI Logic carries an `inferenceSource` stamp (`ON_DEVICE` / `IN_CLOUD`). The UI badges each result from that stamp and keeps a session meter of which model answered, with latency in milliseconds. If the on-device model is unavailable, the UI says so plainly and labels the fallback as cloud — it never fakes an on-device result.

## Hybrid architecture

```
Browser (Chrome 139+ desktop)
│
├─ Instant pass ──► getGenerativeModel(ai, { mode: PREFER_ON_DEVICE,
│                      inCloudParams:  gemini-3.5-flash-lite (fallback),
│                      onDeviceParams: Prompt API createOptions })
│                   ├─► Gemini Nano (Chrome Prompt API) — on-device
│                   └─► Gemini Flash-Lite (cloud) — automatic fallback
│                   ◄── response.inferenceSource says who answered
│
├─ Deep pass ─────► getGenerativeModel(ai, { mode: ONLY_IN_CLOUD,
│                      inCloudParams: gemini-3.5-flash + JSON responseSchema })
│                   └─► Gemini (cloud) → structured JSON → rendered sections
│
└─ Firebase App Check guards every AI Logic request
   (debug-token provider in this build; reCAPTCHA-ready)
```

APIs used, per the official Firebase AI Logic hybrid-inference docs
([get started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started),
[configuration options](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options)):

| API | Where | Purpose |
| --- | --- | --- |
| `getAI(app, { backend: new GoogleAIBackend() })` | `src/firebase-init.js` | AI Logic service on the Gemini Developer API backend |
| `getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE, inCloudParams, onDeviceParams })` | instant model | Hybrid routing: Nano first, cloud fallback |
| `model.initializeDeviceModel(progressCb)` | instant flow | Prepares/downloads the on-device model after a user gesture (docs requirement) |
| `result.response.inferenceSource` | result rendering | Truthful `ON_DEVICE` / `IN_CLOUD` labelling |
| `getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { generationConfig: { responseMimeType, responseSchema } } })` | deep model | Structured cloud analysis (`Schema.object(...)`) |
| `initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled })` | first AI request | App Check protection for the AI Logic endpoints |
| `LanguageModel.availability()` (Chrome Prompt API) | header pill | Honest on-device capability status display |

On-device inference requires Chrome 139+ on desktop; for local development the docs ask for the `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` flag. On any other browser the app still works — everything falls back to the cloud, labelled as such.

## Run it locally

No build step. The app is plain ES modules + an import map pinned to the Firebase Web SDK **13.0.0** on the official gstatic CDN.

```bash
cd hybridai-2026
python3 -m http.server 8080
# or: npx serve .
```

Open <http://localhost:8080>, click **Load sample meeting notes**, then run both analysis passes.

## Firebase configuration

All project settings live in **one file**: `src/firebase-config.js`.

This repository is already connected to a Firebase project with AI Logic enabled (Gemini Developer API backend). To use your own project instead:

1. Create a project in the [Firebase console](https://console.firebase.google.com), register a **Web app**, and enable **AI Logic** (Build → AI Logic → Get started, Gemini Developer API).
2. Paste your `firebaseConfig` object into `src/firebase-config.js` (replacing the existing values).
3. If the config still contains `YOUR_...` placeholders, the app runs in a labelled **demo mode**: the UI loads fully and AI requests fail gracefully with an explanation.

### App Check (debug token — development)

Firebase App Check is enforced for AI Logic. This build uses the **debug token** approach (explicitly accepted by the competition rules), wired in `createAppCheckProvider()` / `ensureAppCheck()` in `src/firebase-init.js`:

1. Run the app once and open DevTools → Console. You'll see
   `Firebase App Check debug token: <token>` (also available via the
   Firebase CLI command printed next to it).
2. Register it once: Firebase console → **App Check** → **Apps** → your
   web app → **Manage debug tokens** → add the token.
   *Until this one-time registration is done, cloud AI calls are rejected
   by App Check enforcement — the app surfaces that exact error.*
3. Optionally pin a fixed token in `src/firebase-config.js`
   (`appCheckSettings.debugToken`) so the same token is reused.

**Going to production:** in `src/firebase-config.js` set
`appCheckSettings.useDebugToken = false` and put a real reCAPTCHA v3 (or
Enterprise) site key in `appCheckSettings.recaptchaSiteKey`. The provider
is constructed in exactly one place, so nothing else changes.

## Project layout

```
index.html            Page shell + import map (Firebase SDK 13.0.0, gstatic)
styles.css            Dark UI, badges, hybrid meter, flashcards
src/
  firebase-config.js  ★ the only file with project settings + App Check + models
  firebase-init.js    Firebase/AI Logic wiring: service, both models, App Check,
                      on-device availability probe, deep-analysis JSON schema
  main.js             UI logic, prompts, parsing, latency + inference-source rendering
  sample-data.js      Built-in sample meeting notes (one-click demo)
```

## Privacy notes

- The instant pass, when answered on-device, never sends the document anywhere — that's the point of the hybrid design, and the badge proves it per request.
- The deep pass (and any cloud fallback) sends the document text to Firebase AI Logic / Gemini, like any cloud AI feature.
- Input is capped per pass (8k chars instant — on-device context is small; 60k deep) and the UI tells you when truncation happens.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
