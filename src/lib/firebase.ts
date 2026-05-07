// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDhstHwkEktxVNsMcYjoPnLVRJ8pDfF69E",
  authDomain: "vailo-6dd55.firebaseapp.com",
  projectId: "vailo-6dd55",
  storageBucket: "vailo-6dd55.firebasestorage.app",
  messagingSenderId: "108487807738",
  appId: "1:108487807738:web:135ea0df2c8877678bef43",
  measurementId: "G-5TRC2HHEBL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize and export Authentication
export const auth = getAuth(app);

export const db = getFirestore(app);