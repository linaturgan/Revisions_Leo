import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/*
  Fonctionnement :
  - index.html contient <meta name="revision-home" content="true"> :
    identification par prénom/pseudo si c'est la première visite sur cet appareil,
    mais AUCUNE séance de révision n'est créée.
  - les pages d'exercices chargent le même suivi.js :
    elles utilisent le profil déjà créé depuis l'accueil, sans jamais demander le nom,
    puis enregistrent la séance et les scores.
*/

const isHome = document.querySelector('meta[name="revision-home"]')?.content === "true";
const subject = document.querySelector('meta[name="revision-subject"]')?.content || "Révisions";
const pageActivity = document.querySelector('meta[name="revision-activity"]')?.content || document.title;

let profile = null;
let sessionRef = null;
let activeSeconds = 0;
let activeSince = (!isHome && document.visibilityState === "visible") ? performance.now() : null;
let flushing = false;

function injectStyles(){
  if(document.getElementById("suiviLeoStyles")) return;
  const style = document.createElement("style");
  style.id = "suiviLeoStyles";
  style.textContent = `
    .suivi-overlay{position:fixed;inset:0;z-index:99999;background:rgba(18,27,48,.62);backdrop-filter:blur(5px);display:grid;place-items:center;padding:20px}
    .suivi-modal{width:min(430px,100%);background:white;border-radius:24px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.25);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#172033}
    .suivi-modal h2{margin:0 0 8px;font-size:27px}.suivi-modal p{margin:0 0 17px;color:#657087;line-height:1.45}
    .suivi-modal input{width:100%;border:2px solid #dce4f2;border-radius:14px;padding:13px 14px;font-size:19px;font-weight:750;outline:none}
    .suivi-modal input:focus{border-color:#246bfd;box-shadow:0 0 0 3px rgba(36,107,253,.11)}
    .suivi-modal button{width:100%;margin-top:12px;border:0;border-radius:14px;padding:12px 15px;background:#246bfd;color:white;font-size:16px;font-weight:900;cursor:pointer}
    .suivi-modal .mini{font-size:12px;margin-top:11px;margin-bottom:0;color:#8992a4;text-align:center}
    .suivi-user-chip{position:fixed;right:12px;bottom:12px;z-index:9990;background:rgba(255,255,255,.94);border:1px solid #dce4f2;border-radius:999px;padding:7px 11px;box-shadow:0 5px 18px rgba(30,45,80,.12);font:800 12px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#46516a;pointer-events:none}
  `;
  document.head.appendChild(style);
}

function askName(){
  injectStyles();
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "suivi-overlay";
    overlay.innerHTML = `
      <div class="suivi-modal" role="dialog" aria-modal="true" aria-labelledby="suiviTitle">
        <h2 id="suiviTitle">👋 Qui révise ?</h2>
        <p>Entre simplement ton prénom ou ton pseudo. Tu ne devras le faire qu'une seule fois sur cet appareil.</p>
        <input id="suiviName" maxlength="30" autocomplete="name" placeholder="Prénom ou pseudo" aria-label="Prénom ou pseudo">
        <button id="suiviSave">C'est parti 🚀</button>
        <p class="mini">Aucun mot de passe ni numéro de téléphone n'est demandé.</p>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector("#suiviName");
    const button = overlay.querySelector("#suiviSave");

    const submit = () => {
      const name = input.value.trim().replace(/\s+/g," ").slice(0,30);
      if(!name){ input.focus(); return; }
      overlay.remove();
      resolve(name);
    };
    button.addEventListener("click", submit);
    input.addEventListener("keydown", e => { if(e.key === "Enter") submit(); });
    setTimeout(() => input.focus(), 60);
  });
}

function showUserChip(name){
  injectStyles();
  document.getElementById("suiviUserChip")?.remove();
  const chip = document.createElement("div");
  chip.id = "suiviUserChip";
  chip.className = "suivi-user-chip";
  chip.textContent = `👤 ${name}`;
  document.body.appendChild(chip);
}

function ensureAuth(){
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async user => {
      if(user){ unsub(); resolve(user); return; }
      try{
        const cred = await signInAnonymously(auth);
        unsub();
        resolve(cred.user);
      }catch(err){
        unsub();
        reject(err);
      }
    }, reject);
  });
}

async function ensureProfile(user){
  const ref = doc(db, "profiles", user.uid);
  const snap = await getDoc(ref);

  if(snap.exists()){
    profile = { uid:user.uid, ...snap.data() };
    await updateDoc(ref, { lastSeenAt: serverTimestamp() });
    showUserChip(profile.name);
    return profile;
  }

  // IMPORTANT : le prénom n'est demandé que sur la page d'accueil.
  // Si quelqu'un arrive directement sur une activité sans profil, on le renvoie
  // d'abord sur l'accueil, puis on reviendra automatiquement à l'activité.
  if(!isHome){
    try{ sessionStorage.setItem("suiviLeoReturnTo", location.href); }catch(e){}
    location.replace(new URL("./index.html", import.meta.url).href);
    return null;
  }

  const name = await askName();
  profile = { uid:user.uid, name, role:"eleve" };
  await setDoc(ref, {
    name,
    role:"eleve",
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp()
  });
  showUserChip(profile.name);

  // Si l'utilisateur avait ouvert directement une activité avant d'être identifié,
  // on le renvoie automatiquement dessus après la saisie de son prénom/pseudo.
  if(isHome){
    try{
      const returnTo = sessionStorage.getItem("suiviLeoReturnTo");
      if(returnTo){
        sessionStorage.removeItem("suiviLeoReturnTo");
        const target = new URL(returnTo);
        if(target.origin === location.origin){
          setTimeout(() => location.href = target.href, 120);
        }
      }
    }catch(e){}
  }

  return profile;
}

function commitActiveInterval(){
  if(isHome) return;
  if(activeSince !== null){
    const elapsed = Math.max(0, (performance.now() - activeSince) / 1000);
    activeSeconds += elapsed;
    activeSince = performance.now();
  }
}

async function flushSession(){
  if(isHome || !sessionRef || flushing) return;
  flushing = true;
  try{
    commitActiveInterval();
    await updateDoc(sessionRef, {
      activeSeconds: Math.round(activeSeconds),
      lastSeenAt: serverTimestamp()
    });
  }catch(err){
    console.warn("Suivi : mise à jour de séance impossible", err);
  }finally{
    flushing = false;
  }
}

async function createSession(user){
  if(isHome || !profile) return;
  sessionRef = doc(collection(db, "sessions"));
  await setDoc(sessionRef, {
    uid: user.uid,
    name: profile.name,
    subject,
    activity: pageActivity,
    path: location.pathname,
    startedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    activeSeconds: 0
  });
}

const ready = (async () => {
  try{
    const user = await ensureAuth();
    const currentProfile = await ensureProfile(user);

    if(!currentProfile){
      return { user, profile:null, sessionId:null };
    }

    if(!isHome){
      await createSession(user);
    }

    return {
      user,
      profile:currentProfile,
      sessionId:sessionRef?.id ?? null
    };
  }catch(err){
    console.error("Le suivi Firebase n'a pas pu démarrer :", err);
    return null;
  }
})();

async function recordAttempt({ activity, score, maxScore, mode = "", details = null }){
  const state = await ready;
  if(!state?.profile || !sessionRef) return false;

  commitActiveInterval();

  const safeScore = Number(score);
  const safeMax = Number(maxScore);
  const pct = safeMax > 0 ? Math.round((safeScore / safeMax) * 100) : 0;

  await addDoc(collection(db, "attempts"), {
    uid: state.user.uid,
    name: profile.name,
    sessionId: sessionRef.id,
    subject,
    pageActivity,
    activity,
    mode,
    score: safeScore,
    maxScore: safeMax,
    percentage: pct,
    details: details ?? {},
    activeSecondsAtAttempt: Math.round(activeSeconds),
    createdAt: serverTimestamp()
  });

  await flushSession();
  return true;
}

window.SuiviLeo = {
  ready,
  recordAttempt,
  flushSession,
  getProfile: () => profile
};

// Le chrono ne concerne que les pages d'exercices, jamais l'accueil.
if(!isHome){
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "hidden"){
      if(activeSince !== null){
        activeSeconds += Math.max(0, (performance.now() - activeSince) / 1000);
        activeSince = null;
      }
      flushSession();
    }else{
      activeSince = performance.now();
    }
  });

  setInterval(() => {
    if(document.visibilityState === "visible") flushSession();
  }, 60000);

  window.addEventListener("pagehide", () => { flushSession(); });
}
