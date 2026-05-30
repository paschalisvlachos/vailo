// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { getAI } from "firebase/ai";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "vailoapp-497113.firebaseapp.com",
  projectId: "vailoapp-497113",
  storageBucket: "vailoapp-497113.firebasestorage.app",
  messagingSenderId: "1023597244475",
  appId: "1:1023597244475:web:d93a069968cda7531bac1e",
  measurementId: "G-1XJ4P63WBQ"
};

const app = initializeApp(firebaseConfig);

/** Cloud Functions region (must match functions/setGlobalOptions in functions/index.js). */
export const cloudFunctions = getFunctions(app, "us-central1");

// Initialize App Check (production + opt-in dev). Skipped in local dev by default so admin
// callables work without registering a debug token; set VITE_ENABLE_APP_CHECK=true to test it locally.
const shouldInitAppCheck =
  typeof window !== "undefined" &&
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