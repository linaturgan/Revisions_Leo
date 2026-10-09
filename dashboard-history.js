// Display-only archive: the original sessions and attempts are never modified.
export function milliseconds(value){
  if(!value)return 0;
  const n=typeof value.toMillis==='function'?value.toMillis():typeof value==='number'?value:new Date(value).getTime();
  return Number.isFinite(n)&&n>0?n:0;
}
const seconds=value=>Math.max(0,Number(value)||0);
export function archiveSnapshot(sessions,cutoffMs){
  return {version:1,cutoffMs,baselines:Object.fromEntries(sessions.map(s=>[s.id,{seconds:seconds(s.activeSeconds),lastSeenMs:milliseconds(s.lastSeenAt)}]))};
}
export function validArchive(value){
  return value?.version===1&&Number.isFinite(value.cutoffMs)&&value.cutoffMs>0&&value.baselines&&typeof value.baselines==='object'&&!Array.isArray(value.baselines);
}
export function partitionHistory(sessions,attempts,archives){
  const current={sessions:[],attempts:[]},archived={sessions:[],attempts:[]};
  for(const s of sessions){
    const state=archives[s.uid],start=milliseconds(s.startedAt),last=milliseconds(s.lastSeenAt)||start;
    if(!validArchive(state)||start>state.cutoffMs){current.sessions.push({...s,displayAt:start||last});continue}
    const baseline=state.baselines[s.id];
    // A record received late is dated using its original timestamp.
    const stored=baseline?seconds(baseline.seconds):last<=state.cutoffMs?seconds(s.activeSeconds):0;
    if(baseline||last<=state.cutoffMs){archived.sessions.push({...s,activeSeconds:stored,lastSeenAt:baseline?.lastSeenMs||last,displayAt:start||last,archived:true})}
    if(last>state.cutoffMs){current.sessions.push({...s,activeSeconds:Math.max(0,seconds(s.activeSeconds)-stored),displayAt:last,continued:true})}
  }
  for(const a of attempts){
    const state=archives[a.uid],at=milliseconds(a.createdAt);
    (validArchive(state)&&at>0&&at<=state.cutoffMs?archived:current).attempts.push({...a,displayAt:at});
  }
  return {current,archived};
}
const dayFormat=new Intl.DateTimeFormat('fr-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'});
export function dayKey(value){const at=milliseconds(value);return at?dayFormat.format(new Date(at)):'unknown'}
export function dayLabel(key){return key==='unknown'?'Date inconnue':new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(key+'T12:00:00Z'))}
export function groupDays(items){
  const groups=new Map();
  for(const item of items){const key=dayKey(item.displayAt);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}
  return [...groups].sort(([a],[b])=>a==='unknown'?1:b==='unknown'?-1:b.localeCompare(a)).map(([key,rows])=>({key,label:dayLabel(key),rows:rows.sort((a,b)=>b.displayAt-a.displayAt)}));
}
export function archiveDates(history){return groupDays([...history.sessions,...history.attempts]).map(({key,label})=>({key,label}))}
