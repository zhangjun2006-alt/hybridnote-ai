/**
 * firebase-config.js — the ONLY file that holds Firebase project settings.
 *
 * This copy is connected to the Firebase project "Hybrid AI Assistant"
 * (projectId: hybrid-ai-assistant-a4fd2), with Firebase AI Logic enabled
 * on the Gemini Developer API backend. To point the app at a different
 * project, replace the values below with those from:
 *   Firebase console → Project settings → General → Your apps → Web app
 *
 * (isPlaceholderConfig below still detects "YOUR_..." placeholder values
 * and switches the app into its labelled demo mode, so a fresh checkout
 * with an emptied config degrades gracefully instead of crashing.)
 */

export const firebaseConfig = {
  apiKey: "AIzaSyAiTbMpw33ciXJtC5n-jX7XPakrbx0U6rg",
  authDomain: "hybrid-ai-assistant-a4fd2.firebaseapp.com",
  projectId: "hybrid-ai-assistant-a4fd2",
  storageBucket: "hybrid-ai-assistant-a4fd2.firebasestorage.app",
  messagingSenderId: "754650226103",
  appId: "1:754650226103:web:1e352d349a092584925c32",
};

/**
 * App Check settings.
 *
 * The #BuildHybridAI competition rules explicitly accept App Check debug
 * tokens, so `useDebugToken` defaults to true:
 *
 *   - With useDebugToken: true, the SDK exchanges a debug token instead of
 *     performing reCAPTCHA attestation. On first run the token is printed
 *     to the browser console ("Firebase App Check debug token: ...") and
 *     must be registered once in Firebase console →
 *     App Check → Apps → your web app → Manage debug tokens.
 *   - If you set `debugToken` to a specific UUID string, that token is
 *     used instead of a randomly generated one (handy for CI / judges).
 *
 * To go to production later: set useDebugToken to false and put a real
 * reCAPTCHA v3 site key in recaptchaSiteKey. The provider is constructed
 * in exactly one place (createAppCheckProvider in firebase-init.js), so
 * swapping providers touches nothing else.
 */
export const appCheckSettings = {
  useDebugToken: true,
  debugToken: "072c573a-b8c3-42e3-b1c4-0ba0c8b12e94", // pinned debug token, registered in the Firebase console for this project
  recaptchaSiteKey: "YOUR_RECAPTCHA_V3_SITE_KEY",
};

/**
 * Cloud models used through Firebase AI Logic (Gemini Developer API
 * backend). On-device inference always uses Chrome's built-in Gemini Nano
 * via the Prompt API — it has no configurable model name.
 */
export const modelSettings = {
  // Fast, cheap cloud fallback when the on-device model can't answer the
  // "Instant analysis" request (also the SDK's default fallback family).
  instantCloudFallback: "gemini-3.5-flash-lite",
  // Stronger cloud model for the structured "Deep analysis".
  deepAnalysis: "gemini-3.5-flash",
};

/** True while the config above still contains placeholder values. */
export function isPlaceholderConfig(config = firebaseConfig) {
  return (
    !config ||
    typeof config.apiKey !== "string" ||
    config.apiKey.startsWith("YOUR_") ||
    typeof config.projectId !== "string" ||
    config.projectId.startsWith("YOUR_") ||
    typeof config.appId !== "string" ||
    config.appId.startsWith("YOUR_")
  );
}
