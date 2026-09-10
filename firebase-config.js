// Configuration Firebase du site de révisions de Léo.
// Ce fichier peut être public : la sécurité repose sur Firebase Authentication
// et sur les règles Firestore, pas sur le masquage de firebaseConfig.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBSgvc4uZ1N1tiejwSRxlxjAwcjxuWu8UY",
  authDomain: "revisions-leo.firebaseapp.com",
  projectId: "revisions-leo",
  storageBucket: "revisions-leo.firebasestorage.app",
  messagingSenderId: "336939937853",
  appId: "1:336939937853:web:d64757ca4067f380c7fa54",
  measurementId: "G-8XHV324RVE"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
