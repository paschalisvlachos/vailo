// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { getAI } from "firebase/ai";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const appEnv = String(import.meta.env.VITE_APP_ENV || "production").trim().toLowerCase();
export const isStagingEnv = appEnv === "staging";

function requireEnv(name: string, fallback?: string): string {
  const value = String(import.meta.env[name] || fallback || "").trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy values from Firebase Project settings → General → Your apps.`
    );
  }
  return value;
}

const firebaseConfig = {
  apiKey: requireEnv("VITE_FIREBASE_API_KEY"),
  authDomain: requireEnv("VITE_FIREBASE_AUTH_DOMAIN", "vailoapp-497113.firebaseapp.com"),
  projectId: requireEnv("VITE_FIREBASE_PROJECT_ID", "vailoapp-497113"),
  storageBucket: requireEnv("VITE_FIREBASE_STORAGE_BUCKET", "vailoapp-497113.firebasestorage.app"),
  messagingSenderId: requireEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "1023597244475"),
  appId: requireEnv("VITE_FIREBASE_APP_ID", "1:1023597244475:web:d93a069968cda7531bac1e"),
  measurementId: String(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-1XJ4P63WBQ").trim() || undefined,
};

const app = initializeApp(firebaseConfig);

/** Cloud Functions region (must match functions/setGlobalOptions in functions/index.js). */
export const cloudFunctions = getFunctions(app, "us-central1");

// Initialize App Check in production only. Skipped in local dev and staging so admin
// callables work without registering a debug token; set VITE_ENABLE_APP_CHECK=true to test it locally.
const shouldInitAppCheck =
  typeof window !== "undefined" &&
  !isStagingEnv &&
  (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_APP_CHECK === "true");

if (shouldInitAppCheck) {
  const debugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN as string | undefined;
  if (import.meta.env.DEV && debugToken?.trim()) {
    (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debugToken.trim();
  }

  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider("6Lcpg_csAAAAALbY_wG78s4Ij1IU2MhUIUDbzaN5"),
    isTokenAutoRefreshEnabled: true,
  });
}

export { app };
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const ai = getAI(app);