// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
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

// Initialize App Check to secure your AI and Database
if (typeof window !== "undefined") {
  initializeAppCheck(app, {
    // PASTE YOUR SITE KEY RIGHT HERE 👇
    provider: new ReCaptchaEnterpriseProvider("6Lcpg_csAAAAALbY_wG78s4Ij1IU2MhUIUDbzaN5"),
    isTokenAutoRefreshEnabled: true
  });
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const ai = getAI(app);