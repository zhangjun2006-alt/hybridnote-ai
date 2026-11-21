/**
 * firebase-init.js — all Firebase / Firebase AI Logic wiring for HybridNote AI.
 *
 * Implements hybrid inference exactly as documented in the official
 * Firebase AI Logic "hybrid inference for Web" guides:
 *
 *   - Service:      getAI(app, { backend: new GoogleAIBackend() })
 *   - Instant:      getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE,
 *                     inCloudParams: {...}, onDeviceParams: {...} })
 *                   → Gemini Nano (Chrome Prompt API) first, cloud fallback.
 *                   result.response.inferenceSource reports the SDK's
 *                   InferenceSource values ("on_device" / "in_cloud") so
 *                   the UI can state truthfully who answered.
 *   - Deep:         getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD,
 *                     inCloudParams: { model, generationConfig with a
 *                     responseSchema } }) → structured JSON from Gemini.
 *   - On-device:    model.initializeDeviceModel(progressCb) is called from a
 *                   user gesture before the first on-device request, as the
 *                   docs require (user-activation requirement).
 *   - App Check:    initialized (lazily, right before the first AI request)
 *                   with the debug-token flow enabled by default — see
 *                   firebase-config.js. The provider is built in ONE place
 *                   (createAppCheckProvider) so reCAPTCHA can be swapped in.
 *
 * Everything is guarded: with a placeholder config the page still loads,
 * and AI calls fail into a labelled demo-mode state instead of crashing.
 */

import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  Schema,
} from "firebase/ai";

export { InferenceSource };
import {
  firebaseConfig,
  appCheckSettings,
  modelSettings,
  isPlaceholderConfig,
} from "./firebase-config.js";

let app = null;
let ai = null;
let appCheck = null;

export const firebaseState = {
  demoMode: isPlaceholderConfig(),
  initialized: false,
  initError: null,
};

/** Initialize the Firebase app + AI Logic service. Never throws. */
export function initFirebase() {
  if (firebaseState.initialized) return firebaseState;
  try {
    app = initializeApp(firebaseConfig);
    ai = getAI(app, { backend: new GoogleAIBackend() });
    firebaseState.initialized = true;
  } catch (err) {
    firebaseState.initError = err;
  }
  return firebaseState;
}

/**
 * The single place an App Check provider is constructed.
 * Swap providers here (e.g. ReCaptchaEnterpriseProvider) and nothing
 * else in the codebase changes.
 */
function createAppCheckProvider() {
  return new ReCaptchaV3Provider(appCheckSettings.recaptchaSiteKey);
}

/**
 * Initialize App Check (idempotent). Called lazily right before the first
 * AI request so the initial page load stays clean even before a real
 * Firebase project is connected.
 */
export function ensureAppCheck() {
  if (appCheck || !app) return appCheck;
  try {
    if (appCheckSettings.useDebugToken) {
      // Debug provider flow, per the official App Check docs: set the flag
      // BEFORE initializeAppCheck. A fixed token string may be supplied in
      // firebase-config.js; `true` auto-generates one and prints it to the
      // console for one-time registration in the Firebase console.
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckSettings.debugToken
        ? appCheckSettings.debugToken
        : true;
    }
    appCheck = initializeAppCheck(app, {
      provider: createAppCheckProvider(),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    // App Check is best-effort at init time; a failure surfaces properly
    // when the AI request itself is attempted.
    console.warn("App Check initialization failed:", err);
  }
  return appCheck;
}

/** Structured-output schema for the Deep analysis (cloud Gemini). */
export const DEEP_ANALYSIS_SCHEMA = Schema.object({
  properties: {
    executiveSummary: Schema.string({
      description: "A 3-5 sentence executive summary of the whole document.",
    }),
    actionItems: Schema.array({
      items: Schema.object({
        properties: {
          task: Schema.string({ description: "The action to take." }),
          owner: Schema.string({
            description: "Person responsible, or 'Unassigned'.",
          }),
          due: Schema.string({
            description: "Deadline as written in the text, or 'Not specified'.",
          }),
        },
      }),
    }),
    decisions: Schema.array({
      items: Schema.string({ description: "A decision that was made." }),
    }),
    risks: Schema.array({
      items: Schema.string({
        description: "A risk, blocker, or open concern.",
      }),
    }),
    flashcards: Schema.array({
      items: Schema.object({
        properties: {
          question: Schema.string(),
          answer: Schema.string(),
        },
      }),
    }),
  },
  optionalProperties: ["actionItems", "decisions", "risks"],
});

/**
 * "Instant analysis" model — hybrid, on-device first.
 * Uses Gemini Nano via Chrome's Prompt API when available and falls back
 * to a fast cloud Gemini model otherwise (the SDK performs the routing;
 * response.inferenceSource tells us which one actually answered).
 */
export function createInstantModel() {
  if (!ai) throw new Error("Firebase AI Logic service is not initialized.");
  return getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: {
      model: modelSettings.instantCloudFallback,
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    },
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      },
    },
  });
}

/**
 * "Deep analysis" model — cloud only, structured JSON output.
 */
export function createDeepModel() {
  if (!ai) throw new Error("Firebase AI Logic service is not initialized.");
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: modelSettings.deepAnalysis,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseSchema: DEEP_ANALYSIS_SCHEMA,
      },
    },
  });
}

/**
 * Probe Chrome's built-in Prompt API (the API Firebase AI Logic uses for
 * on-device inference) so the UI can show an honest device status:
 *   "available" | "downloadable" | "downloading" | "unavailable" | "unsupported"
 * This is a capability probe only — actual results are always labelled
 * from response.inferenceSource, never from this probe.
 */
export async function probeOnDeviceAvailability() {
  try {
    if (typeof LanguageModel === "undefined" || !LanguageModel.availability) {
      return "unsupported";
    }
    const status = await LanguageModel.availability();
    return typeof status === "string" ? status : "unavailable";
  } catch {
    return "unavailable";
  }
}
