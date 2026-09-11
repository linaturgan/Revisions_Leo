import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
let state = null;
let members = [];
let sessions = [];
let attempts = [];
let unsubs = [];

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function tsMs(v){
  if(!v) return 0;
  if(typeof v.toMillis === "function") return v.toMillis();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}
function fmtDate(v){
  const ms=tsMs(v);
  if(!ms) return "—";
  return new Intl.DateTimeFormat("fr-FR",{dateStyle:"short",timeStyle:"short"}).format(new Date(ms));
}
function fmtDuration(sec){
  sec=Number(sec)||0;
  if(sec<60) return `${Math.round(sec)} s`;
  const m=Math.round(sec/60);
  if(m<60) return `${m} min`;
  const h=Math.floor(m/60), r=m%60;
  return `${h} h${r ? " "+r+" min" : ""}`;
}
function uniqueById(items){
  const map=new Map();
  items.forEach(x=>map.set(x.id,x));
  return [...map.values()];
}
function stopListeners(){
  unsubs.forEach(u=>{try{u()}catch{}});
  unsubs=[];
}

async function discoverMembers(){
  const me = state.profile;
  const groupKey = me.groupId || state.user.uid;
  const found = [{id:state.user.uid,...me}];

  // Le profil "principal" du groupe peut être différent de l'appareil courant.
  if(groupKey !== state.user.uid){
    try{
      const snap = await getDoc(doc(db,"profiles",groupKey));
      if(snap.exists()) found.push({id:snap.id,...snap.data()});
    }catch(e){ console.warn("Profil principal inaccessible",e); }
  }

  // Les autres appareils regroupés portent groupId = identifiant du profil principal.
  await new Promise(resolve=>{
    const q=query(collection(db,"profiles"),where("groupId","==",groupKey));
    const unsub=onSnapshot(q,snap=>{
      snap.docs.forEach(d=>found.push({id:d.id,...d.data()}));
      members=uniqueById(found);
      unsub();
      resolve();
    },err=>{
      console.warn("Recherche des appareils regroupés impossible",err);
      members=uniqueById(found);
      resolve();
    });
  });

  if(!members.length) members=uniqueById(found);
}

function startDataListeners(){
  stopListeners();
  sessions=[];
  attempts=[];

  const sessionMaps=new Map();
  const attemptMaps=new Map();

  members.forEach(m=>{
    const qs=query(collection(db,"sessions"),where("uid","==",m.id));
    unsubs.push(onSnapshot(qs,snap=>{
      sessionMaps.set(m.id,snap.docs.map(d=>({id:d.id,...d.data()})));
      sessions=[...sessionMaps.values()].flat();
      render();
    },err=>console.warn("Séances inaccessibles",err)));

    const qa=query(collection(db,"attempts"),where("uid","==",m.id));
    unsubs.push(onSnapshot(qa,snap=>{
      attemptMaps.set(m.id,snap.docs.map(d=>({id:d.id,...d.data()})));
      attempts=[...attemptMaps.values()].flat();
      render();
    },err=>console.warn("Scores inaccessibles",err)));
  });
}

function currentProfile(){
  const primaryId=state.profile.groupId || state.user.uid;
  return members.find(m=>m.id===primaryId) || members[0] || state.profile;
}
function currentName(){
  return currentProfile()?.name || state.profile?.name || "Mon profil";
}
function currentAvatar(){
  return currentProfile()?.avatarData || members.find(m=>m.avatarData)?.avatarData || "";
}

function render(){
  if(!state?.profile) return;
  $("spaceLoading").classList.add("hidden");
  $("spaceContent").classList.remove("hidden");

  $("spaceName").textContent=currentName();
  $("spaceDevices").textContent=`${members.length} appareil${members.length>1?"s":""} associé${members.length>1?"s":""}`;
  $("openSpaceBtn").textContent=`🌟 Mon espace`;

  const avatar=currentAvatar();
  const img=$("spaceAvatar");
  const placeholder=$("spaceAvatarPlaceholder");
  if(avatar){
    img.src=avatar;
    img.classList.remove("hidden");
    placeholder.classList.add("hidden");
    $("removeAvatarBtn").classList.remove("hidden");
  }else{
    img.removeAttribute("src");
    img.classList.add("hidden");
    placeholder.classList.remove("hidden");
    $("removeAvatarBtn").classList.add("hidden");
  }

  $("spaceSessions").textContent=sessions.length;
  $("spaceAttempts").textContent=attempts.length;
  $("spaceTime").textContent=fmtDuration(sessions.reduce((a,s)=>a+(Number(s.activeSeconds)||0),0));

  const percentages=attempts.map(a=>Number(a.percentage)).filter(Number.isFinite);
  $("spaceAverage").textContent=percentages.length
    ? Math.round(percentages.reduce((a,b)=>a+b,0)/percentages.length)+" %"
    : "—";

  const subjects={};
  attempts.forEach(a=>{
    const key=a.subject || "Autre";
    if(!subjects[key]) subjects[key]={n:0,sum:0};
    if(Number.isFinite(Number(a.percentage))){
      subjects[key].n++;
      subjects[key].sum+=Number(a.percentage);
    }
  });
  $("spaceSubjects").innerHTML=Object.keys(subjects).length
    ? Object.entries(subjects).map(([name,v])=>`
      <div class="space-row">
        <div><b>${esc(name)}</b><div class="space-mini">${v.n} tentative${v.n>1?"s":""}</div></div>
        <div class="space-score">${v.n?Math.round(v.sum/v.n)+" %":"—"}</div>
      </div>`).join("")
    : '<div class="space-empty">Pas encore de résultat.</div>';

  const recent=[...attempts].sort((a,b)=>tsMs(b.createdAt)-tsMs(a.createdAt)).slice(0,6);
  $("spaceRecent").innerHTML=recent.length
    ? recent.map(a=>`
      <div class="space-row">
        <div><b>${esc(a.activity||"Exercice")}</b><div class="space-mini">${esc(a.subject||"")} · ${fmtDate(a.createdAt)}</div></div>
        <div class="space-score">${Number(a.score)||0}/${Number(a.maxScore)||0}</div>
      </div>`).join("")
    : '<div class="space-empty">Aucun score pour le moment.</div>';

  const counts=new Map();
  attempts.forEach(a=>{
    const errs=a.details?.erreurs;
    if(Array.isArray(errs)) errs.forEach(e=>counts.set(String(e),(counts.get(String(e))||0)+1));
  });
  const top=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  $("spaceErrors").innerHTML=top.length
    ? `<div class="space-tags">${top.map(([w,n])=>`<span class="space-tag">${esc(w)}${n>1?" ×"+n:""}</span>`).join("")}</div>`
    : '<div class="space-empty">Rien à signaler pour le moment 👌</div>';
}


async function imageFileToAvatar(file){
  if(!file || !String(file.type||"").startsWith("image/")){
    throw new Error("Choisis une image.");
  }
  if(file.size > 12 * 1024 * 1024){
    throw new Error("Cette image est trop volumineuse.");
  }

  const url=URL.createObjectURL(file);
  try{
    const img=new Image();
    img.decoding="async";
    await new Promise((resolve,reject)=>{
      img.onload=resolve;
      img.onerror=()=>reject(new Error("Impossible de lire cette image."));
      img.src=url;
    });

    const side=Math.min(img.naturalWidth,img.naturalHeight);
    const sx=(img.naturalWidth-side)/2;
    const sy=(img.naturalHeight-side)/2;
    const canvas=document.createElement("canvas");
    const size=180;
    canvas.width=size; canvas.height=size;
    const ctx=canvas.getContext("2d");
    ctx.drawImage(img,sx,sy,side,side,0,0,size,size);

    let quality=.78;
    let data=canvas.toDataURL("image/jpeg",quality);
    while(data.length>120000 && quality>.42){
      quality-=.08;
      data=canvas.toDataURL("image/jpeg",quality);
    }
    if(data.length>140000){
      throw new Error("La photo reste trop lourde après compression. Essaie une autre photo.");
    }
    return data;
  }finally{
    URL.revokeObjectURL(url);
  }
}

async function saveAvatarData(avatarData){
  // La photo est enregistrée sur le profil principal du groupe.
  // Ainsi, un seul enregistrement suffit même si Léo utilise plusieurs appareils.
  const primaryId = state.profile.groupId || state.user.uid;

  await updateDoc(doc(db,"profiles",primaryId),{avatarData});

  members=members.map(m=>m.id===primaryId ? {...m,avatarData} : m);
  if(state.user.uid===primaryId && state.profile){
    state.profile.avatarData=avatarData;
  }
  render();
}

async function chooseAvatar(file){
  if(!file)return;
  $("avatarInput").disabled=true;
  try{
    const data=await imageFileToAvatar(file);
    await saveAvatarData(data);
  }catch(e){
    console.error("Erreur photo de profil :", e);
    if(e?.code==="permission-denied"){
      alert("La photo n’a pas pu être enregistrée : les règles Firebase ne l’autorisent pas encore. Mets bien à jour les règles Firestore fournies avec cette version.");
    }else{
      alert(e.message||e);
    }
  }finally{
    $("avatarInput").disabled=false;
    $("avatarInput").value="";
  }
}

async function renameProfile(){
  const input=$("renameInput");
  const name=input.value.trim().replace(/\s+/g," ").slice(0,30);
  if(!name) return;

  $("saveRenameBtn").disabled=true;
  try{
    const batch=writeBatch(db);
    members.forEach(m=>batch.update(doc(db,"profiles",m.id),{name}));
    await batch.commit();

    try{localStorage.setItem("suiviLeoName",name)}catch{}
    members=members.map(m=>({...m,name}));
    if(state.profile) state.profile.name=name;
    $("renameForm").classList.add("hidden");
    render();

    // Le petit badge fixe créé par suivi.js est rafraîchi immédiatement.
    const chip=document.getElementById("suiviUserChip");
    if(chip) chip.textContent=`👤 ${name}`;
  }catch(e){
    alert("Impossible de modifier le nom : "+(e.message||e));
  }finally{
    $("saveRenameBtn").disabled=false;
  }
}

function openPanel(){
  $("spaceOverlay").classList.remove("hidden");
  $("spaceOverlay").setAttribute("aria-hidden","false");
  document.body.style.overflow="hidden";
}
function closePanel(){
  $("spaceOverlay").classList.add("hidden");
  $("spaceOverlay").setAttribute("aria-hidden","true");
  document.body.style.overflow="";
}

$("openSpaceBtn")?.addEventListener("click",openPanel);
$("closeSpaceBtn")?.addEventListener("click",closePanel);
$("spaceOverlay")?.addEventListener("click",e=>{if(e.target===$("spaceOverlay"))closePanel()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closePanel()});

$("showRenameBtn")?.addEventListener("click",()=>{
  $("renameInput").value=currentName();
  $("renameForm").classList.toggle("hidden");
  if(!$("renameForm").classList.contains("hidden")) setTimeout(()=>$("renameInput").focus(),30);
});
$("saveRenameBtn")?.addEventListener("click",renameProfile);
$("renameInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")renameProfile()});
$("avatarInput")?.addEventListener("change",e=>chooseAvatar(e.target.files?.[0]));
$("removeAvatarBtn")?.addEventListener("click",async()=>{
  if(!confirm("Retirer la photo de profil ?"))return;
  try{await saveAvatarData("")}catch(e){alert("Impossible de retirer la photo : "+(e.message||e))}
});

(async()=>{
  state=await window.SuiviLeo?.ready;
  if(!state?.profile){
    $("spaceLoading").innerHTML='<div class="space-empty">Le profil n’a pas pu être chargé.</div>';
    return;
  }
  await discoverMembers();
  render();
  startDataListeners();
})();
