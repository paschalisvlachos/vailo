// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAI } from "firebase/ai";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyD3WPLAlPchKOQKNNsmw1rDmC2-I1ZvcY4",
  authDomain: "vailo-6dd55.firebaseapp.com",
  projectId: "vailo-6dd55",
  storageBucket: "vailo-6dd55.firebasestorage.app",
  messagingSenderId: "108487807738",
  appId: "1:108487807738:web:135ea0df2c8877678bef43",
  measurementId: "G-5TRC2HHEBL"
};

const app = initializeApp(firebaseConfig);

// Initialize App Check to secure your AI and Database
if (typeof window !== "undefined") {
  initializeAppCheck(app, {
    // PASTE YOUR SITE KEY RIGHT HERE 👇
    provider: new ReCaptchaEnterpriseProvider("6LdHl-gsAAAAAGR6_18QYDwExs7qKgr2KQEAWMUB"),
    isTokenAutoRefreshEnabled: true
  });
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const ai = getAI(app);