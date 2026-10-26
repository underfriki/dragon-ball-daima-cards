import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const LOCAL_KEY="db-daima-checklist-imagenes-v2";
const $=id=>document.getElementById(id);
const backendReady=Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const supabase=backendReady?createClient(SUPABASE_URL,SUPABASE_ANON_KEY):null;

let catalog=[];
let state;
let session=null;
let profile=null;
let otherUsers=[];
let allCollections=[];
let trades=[];
let comparedUserId="";
let comparedMatch=null;
let openTradeId=null;
let tradeRealtimeChannel=null;
let chatRealtimeChannel=null;
let recoveryMode=false;

const variants=n=>n<=100?["basic","crystal","rainbow"]:["basic"];
const blankVariant=()=>({owned:false,duplicates:0});
// Initialize saved progress only after its factories are ready.
state=loadLocal();
function fresh(){
  const s={};
  for(let n=1;n<=207;n++){
    s[n]={basic:blankVariant()};
    if(n<=100){s[n].crystal=blankVariant();s[n].rainbow=blankVariant();}
  }
  return s;
}
function normalizeVariant(v){
  if(typeof v==="boolean")return{owned:v,duplicates:0};
  if(typeof v==="number")return{owned:v>0,duplicates:Math.max(0,v-1)};
  if(v&&typeof v==="object")return{owned:!!v.owned||Number(v.duplicates)>0,duplicates:Math.max(0,Math.floor(Number(v.duplicates)||0))};
  return blankVariant();
}
function normalizeState(src){
  const s=fresh();
  if(!src)return s;
  for(let n=1;n<=207;n++){
    const item=src[n]||src[String(n)];
    if(!item)continue;
    for(const v of Object.keys(s[n]))s[n][v]=normalizeVariant(item[v]);
  }
  return s;
}
function loadLocal(){
  try{return normalizeState(JSON.parse(localStorage.getItem(LOCAL_KEY)||"null"))}
  catch{return fresh()}
}
function saveLocal(){localStorage.setItem(LOCAL_KEY,JSON.stringify(state))}
const has=(n,v)=>!!state[n][v].owned;
const dup=(n,v)=>Math.max(0,Number(state[n][v].duplicates)||0);
const complete=n=>variants(n).every(v=>has(n,v));
const anyOwned=n=>variants(n).some(v=>has(n,v));
const missing=n=>variants(n).some(v=>!has(n,v));
const hasDup=n=>variants(n).some(v=>dup(n,v)>0);
const canEdit=()=>Boolean(session?.user);

function toast(message,error=false){
  const d=document.createElement("div"); d.className="toast"+(error?" error":""); d.textContent=message;
  document.body.appendChild(d); setTimeout(()=>d.remove(),4200);
}
function totals(){
  let owned=0,repeats=0,basic=0,crystal=0,rainbow=0,completed=0;
  for(let n=1;n<=207;n++){
    if(complete(n))completed++;
    for(const v of variants(n)){
      if(has(n,v)){owned++; if(v==="basic")basic++; else if(v==="crystal")crystal++; else rainbow++;}
      repeats+=dup(n,v);
    }
  }
  return{owned,repeats,basic,crystal,rainbow,completed};
}
function renderStats(){
  const t=totals(),pct=Math.round(t.owned/407*100);
  $("pct").textContent=pct+"%"; $("owned").textContent=t.owned; $("missing").textContent=407-t.owned;
  $("complete").textContent=t.completed; $("dups").textContent=t.repeats; $("basic").textContent=t.basic+" / 207";
  $("crystal").textContent=t.crystal+" / 100"; $("rainbow").textContent=t.rainbow+" / 100"; $("bar").style.width=(t.owned/407*100)+"%";
}
function label(n,v){return n>100?"Tengo":v==="basic"?"Básica":v==="crystal"?"Cristal":"Arcoíris"}
function variantLabel(v){return v==="basic"?"Básica":v==="crystal"?"Cristal":"Arcoíris"}
function checkRow(n,v){
  const disabled=canEdit()?"":"disabled";
  return `<div class="check">
    <input type="checkbox" data-n="${n}" data-v="${v}" ${has(n,v)?"checked":""} ${disabled}>
    <label>${label(n,v)}</label>
    <div class="rep">
      <button data-m="${n}:${v}" ${!canEdit()||dup(n,v)<1?"disabled":""}>−</button>
      <b>${dup(n,v)}</b>
      <button data-p="${n}:${v}" ${disabled}>+</button>
    </div>
  </div>`;
}
function filtered(){
  const q=$("q").value.trim(),st=$("status").value,vf=$("variant").value,ca=$("category").value;
  return catalog.filter(c=>(!q||String(c.number).includes(q))&&(ca==="all"||c.category===ca)&&(vf==="all"||variants(c.number).includes(vf))&&(st==="all"||st==="missing"&&missing(c.number)||st==="owned"&&anyOwned(c.number)||st==="complete"&&complete(c.number)||st==="dups"&&hasDup(c.number)));
}
function renderGrid(){
  renderStats();
  const vf=$("variant").value,a=filtered();
  $("grid").innerHTML=a.length?a.map(c=>`<article class="card ${complete(c.number)?"complete ":""}${c.landscape?"landscape ":""}${canEdit()?"":"readonly"}">
    <div class="img"><img loading="lazy" src="${c.image}" alt="Carta ${c.number}"></div>
    <div class="body"><div class="n">#${String(c.number).padStart(3,"0")}</div><div class="cat">${c.category}</div>
    <div class="checks">${variants(c.number).filter(v=>vf==="all"||v===vf).map(v=>checkRow(c.number,v)).join("")}</div></div>
  </article>`).join(""):'<div class="empty">No hay resultados.</div>';
}
function localRows(){
  const rows=[];
  for(let n=1;n<=207;n++)for(const v of variants(n)){
    const x=state[n][v];
    if(x.owned||x.duplicates>0)rows.push({card_number:n,variant:v,owned:!!x.owned,duplicates:Math.max(0,x.duplicates)});
  }
  return rows;
}
function stateFromRows(rows){
  const s=fresh();
  for(const r of rows||[]){
    const n=Number(r.card_number),v=r.variant;
    if(s[n]?.[v])s[n][v]={owned:!!r.owned,duplicates:Math.max(0,Number(r.duplicates)||0)};
  }
  return s;
}
async function persistVariant(n,v){
  saveLocal();
  if(!canEdit()||!supabase)return;
  const x=state[n][v];
  const {error}=await supabase.from("collections").upsert({
    user_id:session.user.id,card_number:n,variant:v,owned:!!x.owned,duplicates:Math.max(0,x.duplicates),updated_at:new Date().toISOString()
  },{onConflict:"user_id,card_number,variant"});
  if(error){toast("No se pudo guardar online: "+error.message,true);return;}
  renderMatches();
}
async function syncAccount(){
  if(!canEdit()||!supabase)return;
  $("syncMessage").textContent="Sincronizando tu colección…";
  const {data:rows,error}=await supabase.from("collections").select("card_number,variant,owned,duplicates").eq("user_id",session.user.id);
  if(error){$("syncMessage").textContent="Error al sincronizar.";toast(error.message,true);return;}
  const meaningful=(rows||[]).filter(r=>r.owned||Number(r.duplicates)>0);
  if(meaningful.length===0){
    const local=localRows();
    if(local.length){
      const payload=local.map(r=>({...r,user_id:session.user.id,updated_at:new Date().toISOString()}));
      const {error:upError}=await supabase.from("collections").upsert(payload,{onConflict:"user_id,card_number,variant"});
      if(upError){toast("No se pudo importar el progreso local: "+upError.message,true);}
      else $("syncMessage").textContent="Tu progreso anterior de este navegador se ha importado a tu cuenta.";
    }else $("syncMessage").textContent="Tu cuenta está sincronizada.";
  }else{
    state=stateFromRows(rows); saveLocal(); $("syncMessage").textContent="Colección cargada desde tu cuenta.";
  }
  renderGrid();
}
async function loadProfile(){
  if(!canEdit()||!supabase)return;
  const {data,error}=await supabase.from("profiles").select("id,username").eq("id",session.user.id).single();
  if(!error)profile=data;
}
async function loadUsers(){
  if(!canEdit()||!supabase)return;
  const [profilesResult,collectionsResult]=await Promise.all([
    supabase.from("profiles").select("id,username").neq("id",session.user.id).order("username"),
    supabase.from("collections").select("user_id,card_number,variant,owned,duplicates")
  ]);
  if(profilesResult.error){toast("No se pudieron cargar los usuarios: "+profilesResult.error.message,true);return;}
  if(collectionsResult.error){toast("No se pudieron calcular los matches: "+collectionsResult.error.message,true);return;}
  otherUsers=profilesResult.data||[];
  allCollections=collectionsResult.data||[];
  $("compareUser").innerHTML='<option value="">Selecciona un usuario</option>'+otherUsers.map(u=>`<option value="${u.id}">${escapeHtml(u.username)}</option>`).join("");
  $("compareUser").disabled=false;
  renderMatches();
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
function userName(userId){
  if(userId===session?.user?.id)return profile?.username||"Tú";
  return otherUsers.find(u=>u.id===userId)?.username||"Usuario";
}
function remoteCollection(userId){
  const map=new Map();
  for(const r of allCollections){
    if(r.user_id===userId)map.set(r.card_number+":"+r.variant,{owned:!!r.owned,duplicates:Math.max(0,Number(r.duplicates)||0)});
  }
  return map;
}
function buildTradeMatch(userId){
  const other=remoteCollection(userId),iOffer=[],theyOffer=[];
  for(let n=1;n<=207;n++)for(const v of variants(n)){
    const me=state[n][v],them=other.get(n+":"+v)||{owned:false,duplicates:0};
    if(me.duplicates>0&&!them.owned)iOffer.push({n,v,d:me.duplicates});
    if(them.duplicates>0&&!me.owned)theyOffer.push({n,v,d:them.duplicates});
  }
  return{userId,iOffer,theyOffer,score:iOffer.length+theyOffer.length};
}
function activeTradeWith(userId){
  return trades.find(t=>["proposed","accepted"].includes(t.status)&&
    ((t.from_user===session?.user?.id&&t.to_user===userId)||(t.to_user===session?.user?.id&&t.from_user===userId)));
}
function shortChips(items,limit=6){
  if(!items.length)return'<span class="muted">Ninguna</span>';
  const shown=items.slice(0,limit).map(x=>`<span class="chip trade">${itemText(x.n,x.v,x.d||0)}</span>`).join("");
  return shown+(items.length>limit?`<span class="chip">+${items.length-limit} más</span>`:"");
}
function renderMatches(){
  if(!canEdit())return;
  const matches=otherUsers.map(u=>({...buildTradeMatch(u.id),username:u.username}))
    .filter(m=>m.iOffer.length&&m.theyOffer.length)
    .sort((a,b)=>b.score-a.score||a.username.localeCompare(b.username));
  $("matchCount").textContent=matches.length+" "+(matches.length===1?"match":"matches");
  $("matchesList").innerHTML=matches.length?matches.map(m=>{
    const active=activeTradeWith(m.userId);
    return `<article class="match-card">
      <div class="match-head"><div><strong>${escapeHtml(m.username)}</strong><span class="match-score">${m.theyOffer.length} ↔ ${m.iOffer.length}</span></div>
      <button class="primary" data-propose-user="${m.userId}" ${active?"disabled":""}>${active?"Solicitud activa":"Proponer intercambio"}</button></div>
      <div class="match-columns">
        <div><h3>Te puede ofrecer</h3><div class="compare-list">${shortChips(m.theyOffer)}</div></div>
        <div><h3>Tú puedes ofrecer</h3><div class="compare-list">${shortChips(m.iOffer)}</div></div>
      </div>
    </article>`;
  }).join(""):'<div class="hint">Ahora mismo no hay ningún match mutuo. Aparecerán aquí cuando otro usuario tenga una repetida que te falta y tú tengas una que le falte.</div>';
  updateCompareProposal();
}
function statusLabel(status){
  return({proposed:"Pendiente",accepted:"Aceptado",rejected:"Rechazado",cancelled:"Cancelado",completed:"Completado"})[status]||status;
}
function offerArray(arr){
  return(Array.isArray(arr)?arr:[]).map(x=>({n:Number(x.card_number),v:x.variant,d:Number(x.duplicates)||0}));
}
function requestPerspective(t){
  const mine=t.from_user===session?.user?.id;
  return{
    mine,
    otherId:mine?t.to_user:t.from_user,
    iOffer:offerArray(mine?t.from_offers:t.to_offers),
    theyOffer:offerArray(mine?t.to_offers:t.from_offers)
  };
}
function tradeActions(t){
  const mine=t.from_user===session?.user?.id;
  if(t.status==="proposed"){
    if(mine)return `<button data-trade-action="cancelled" data-trade-id="${t.id}">Cancelar</button>`;
    return `<button class="primary" data-trade-action="accepted" data-trade-id="${t.id}">Aceptar</button>
      <button data-trade-action="rejected" data-trade-id="${t.id}">Rechazar</button>`;
  }
  if(t.status==="accepted")return `<button class="primary" data-open-chat="${t.id}">Abrir chat</button>
    <button data-trade-action="completed" data-trade-id="${t.id}">Marcar completado</button>
    <button data-trade-action="cancelled" data-trade-id="${t.id}">Cancelar</button>`;
  if(t.status==="completed")return `<button data-open-chat="${t.id}">Ver conversación</button>`;
  return "";
}
function renderTradeRequests(){
  const incoming=trades.filter(t=>t.status==="proposed"&&t.to_user===session?.user?.id).length;
  $("pendingTradeBadge").textContent=incoming+" "+(incoming===1?"pendiente":"pendientes");
  $("tradeRequests").innerHTML=trades.length?trades.map(t=>{
    const p=requestPerspective(t),name=escapeHtml(userName(p.otherId));
    return `<article class="trade-request ${t.status}">
      <div class="trade-request-head">
        <div><strong>${name}</strong><span class="status ${t.status}">${statusLabel(t.status)}</span>
        <div class="muted">${t.from_user===session.user.id?"Solicitud enviada":"Solicitud recibida"} · ${new Date(t.created_at).toLocaleDateString("es-ES")}</div></div>
        <div class="trade-actions">${tradeActions(t)}</div>
      </div>
      <div class="trade-offers">
        <div><h3>Te pueden ofrecer</h3><div class="compare-list">${shortChips(p.theyOffer,8)}</div></div>
        <div><h3>Tú puedes ofrecer</h3><div class="compare-list">${shortChips(p.iOffer,8)}</div></div>
      </div>
    </article>`;
  }).join(""):'<div class="hint">Todavía no tienes solicitudes de intercambio.</div>';
  renderMatches();
}
async function loadTrades(){
  if(!canEdit()||!supabase)return;
  const {data,error}=await supabase.from("trade_requests")
    .select("id,from_user,to_user,status,from_offers,to_offers,created_at,updated_at,accepted_at,completed_at")
    .order("created_at",{ascending:false});
  if(error){toast("No se pudieron cargar los intercambios: "+error.message,true);return;}
  trades=data||[];
  renderTradeRequests();
}
async function proposeTrade(userId){
  if(!canEdit()||!userId)return;
  const active=activeTradeWith(userId);
  if(active){toast("Ya existe una solicitud activa con este usuario.");return;}
  const {data,error}=await supabase.from("trade_requests")
    .insert({from_user:session.user.id,to_user:userId,status:"proposed"})
    .select()
    .single();
  if(error){
    const msg=error.code==="23505"?"Ya existe una solicitud activa entre vosotros.":error.message.includes("No mutual")?"El match ha cambiado y ya no es mutuo. Actualiza los matches.":"No se pudo enviar la solicitud: "+error.message;
    toast(msg,true);return;
  }
  toast("Solicitud de intercambio enviada a "+userName(userId)+".");
  await loadTrades();
  return data;
}
async function changeTradeStatus(id,status){
  const {data,error}=await supabase.from("trade_requests").update({status}).eq("id",id).select().single();
  if(error){toast("No se pudo actualizar la solicitud: "+error.message,true);return;}
  toast(status==="accepted"?"Solicitud aceptada. Ya podéis hablar por el chat.":status==="completed"?"Intercambio marcado como completado.":"Solicitud actualizada.");
  await loadTrades();
  if(data.status==="accepted")await openChat(data.id);
  else if(openTradeId===id&&data.status!=="accepted"&&data.status!=="completed")closeChat();
}
function chatRequest(){return trades.find(t=>t.id===openTradeId)}
function renderChatHeader(){
  const t=chatRequest();if(!t)return;
  const p=requestPerspective(t);
  $("chatTitle").textContent="💬 Chat con "+userName(p.otherId);
  $("chatSubtitle").textContent=t.status==="accepted"?"Intercambio aceptado · conversación privada":t.status==="completed"?"Intercambio completado · conversación en solo lectura":"Conversación";
  $("chatOfferSummary").innerHTML=`<div><h3>Te pueden ofrecer</h3><div class="compare-list">${shortChips(p.theyOffer,10)}</div></div>
    <div><h3>Tú puedes ofrecer</h3><div class="compare-list">${shortChips(p.iOffer,10)}</div></div>`;
  const writable=t.status==="accepted";
  $("chatInput").disabled=!writable;$("sendMessageBtn").disabled=!writable;
  $("chatHint").textContent=writable?"Solo vosotros dos podéis leer y escribir en esta conversación.":"Este intercambio está cerrado; puedes consultar la conversación, pero no enviar mensajes.";
}
function renderMessages(messages){
  $("chatMessages").innerHTML=messages.length?messages.map(m=>`<div class="message ${m.sender_id===session.user.id?"mine":"theirs"}">
    <div class="message-meta">${m.sender_id===session.user.id?"Tú":escapeHtml(userName(m.sender_id))} · ${new Date(m.created_at).toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"})}</div>
    <div class="message-body">${escapeHtml(m.body)}</div>
  </div>`).join(""):'<div class="hint">Todavía no hay mensajes. Puedes empezar la conversación.</div>';
  $("chatMessages").scrollTop=$("chatMessages").scrollHeight;
}
async function loadTradeMessages(id){
  const {data,error}=await supabase.from("trade_messages").select("id,trade_request_id,sender_id,body,created_at").eq("trade_request_id",id).order("created_at");
  if(error){toast("No se pudieron cargar los mensajes: "+error.message,true);return;}
  if(openTradeId===id)renderMessages(data||[]);
}
async function openChat(id){
  const t=trades.find(x=>x.id===id);
  if(!t||!["accepted","completed"].includes(t.status))return;
  openTradeId=id;$("chatPanel").hidden=false;renderChatHeader();await loadTradeMessages(id);
  if(chatRealtimeChannel)await supabase.removeChannel(chatRealtimeChannel);
  chatRealtimeChannel=supabase.channel("trade-chat-"+id)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"trade_messages",filter:"trade_request_id=eq."+id},()=>loadTradeMessages(id))
    .subscribe();
  $("chatPanel").scrollIntoView({behavior:"smooth",block:"start"});
}
async function closeChat(){
  openTradeId=null;$("chatPanel").hidden=true;
  if(chatRealtimeChannel){await supabase.removeChannel(chatRealtimeChannel);chatRealtimeChannel=null;}
}
async function sendChatMessage(){
  const t=chatRequest(),body=$("chatInput").value.trim();
  if(!t||t.status!=="accepted"||!body)return;
  $("sendMessageBtn").disabled=true;
  const {error}=await supabase.from("trade_messages").insert({trade_request_id:t.id,sender_id:session.user.id,body});
  $("sendMessageBtn").disabled=false;
  if(error){toast("No se pudo enviar el mensaje: "+error.message,true);return;}
  $("chatInput").value="";await loadTradeMessages(t.id);
}
async function subscribeTradeRealtime(){
  if(!canEdit())return;
  if(tradeRealtimeChannel)await supabase.removeChannel(tradeRealtimeChannel);
  tradeRealtimeChannel=supabase.channel("trade-updates-"+session.user.id)
    .on("postgres_changes",{event:"*",schema:"public",table:"trade_requests"},async()=>{await loadTrades();if(openTradeId)renderChatHeader();})
    .subscribe();
}
async function cleanupTradeRealtime(){
  if(tradeRealtimeChannel){await supabase.removeChannel(tradeRealtimeChannel);tradeRealtimeChannel=null;}
  if(chatRealtimeChannel){await supabase.removeChannel(chatRealtimeChannel);chatRealtimeChannel=null;}
  openTradeId=null;trades=[];allCollections=[];
}
function updateCompareProposal(){
  if(!$("compareProposeBtn"))return;
  const active=comparedUserId?activeTradeWith(comparedUserId):null;
  const mutual=comparedMatch&&comparedMatch.iOffer.length&&comparedMatch.theyOffer.length;
  $("compareProposeBtn").hidden=!mutual;
  $("compareProposeBtn").disabled=!!active;
  $("compareProposeBtn").textContent=active?"Solicitud activa":"Proponer intercambio";
  $("compareProposalHint").textContent=mutual&&!active?"Hay intercambio posible en los dos sentidos.":"";
}

function renderSession(){
  const signed=canEdit();
  if(recoveryMode){
    $("authGate").hidden=false;
    $("appShell").hidden=true;
    return;
  }
  $("authGate").hidden=signed;
  $("appShell").hidden=!signed;
  if(!signed){
    $("compareResults").hidden=true;
    $("compareUser").innerHTML='<option value="">Selecciona un usuario</option>';
    $("chatPanel").hidden=true;
    return;
  }
  $("sessionPill").textContent=profile?.username||session.user.email||"Conectado";
  $("currentUsername").textContent=profile?.username||"Usuario";
  $("currentEmail").textContent=session.user.email||"";
  renderGrid();
}
function objectFromRows(rows){
  const o={};
  for(let n=1;n<=207;n++)o[n]={};
  for(const r of rows||[])if(o[r.card_number])o[r.card_number][r.variant]={owned:!!r.owned,duplicates:Math.max(0,Number(r.duplicates)||0)};
  return o;
}
function getRemote(o,n,v){return o[n]?.[v]||{owned:false,duplicates:0}}
function itemText(n,v,d=0){return `#${String(n).padStart(3,"0")} · ${variantLabel(v)}${d>0?" · x"+d+" rep.":""}`}
function chips(items,trade=false){return items.length?items.map(x=>`<span class="chip ${trade?"trade":""}">${itemText(x.n,x.v,x.d||0)}</span>`).join(""):'<span class="muted">Ninguna.</span>'}
async function compareWith(userId){
  comparedUserId=userId||"";comparedMatch=null;
  if(!userId||!canEdit()||!supabase){$("compareResults").hidden=true;updateCompareProposal();return;}
  $("compareResults").hidden=false;
  ["theirsMissing","mineMissing","theirTrades","myTrades"].forEach(id=>$(id).innerHTML='<span class="muted">Cargando…</span>');
  const {data,error}=await supabase.from("collections").select("card_number,variant,owned,duplicates").eq("user_id",userId);
  if(error){toast("No se pudo comparar: "+error.message,true);return;}
  const other=objectFromRows(data);
  const theirs=[],mine=[],theirTrades=[],myTrades=[];
  for(let n=1;n<=207;n++)for(const v of variants(n)){
    const me=state[n][v],them=getRemote(other,n,v);
    if(them.owned&&!me.owned)theirs.push({n,v});
    if(me.owned&&!them.owned)mine.push({n,v});
    if(them.duplicates>0&&!me.owned)theirTrades.push({n,v,d:them.duplicates});
    if(me.duplicates>0&&!them.owned)myTrades.push({n,v,d:me.duplicates});
  }
  $("theirsMissingCount").textContent=theirs.length;$("mineMissingCount").textContent=mine.length;$("theirTradesCount").textContent=theirTrades.length;$("myTradesCount").textContent=myTrades.length;
  $("theirsMissing").innerHTML=chips(theirs);$("mineMissing").innerHTML=chips(mine);$("theirTrades").innerHTML=chips(theirTrades,true);$("myTrades").innerHTML=chips(myTrades,true);
  comparedMatch={userId,iOffer:myTrades,theyOffer:theirTrades};
  updateCompareProposal();
}

$("grid").addEventListener("change",async e=>{
  const x=e.target.closest("input[data-n]"); if(!x||!canEdit())return;
  const n=+x.dataset.n,v=x.dataset.v; state[n][v].owned=x.checked; if(!x.checked)state[n][v].duplicates=0;
  await persistVariant(n,v); renderGrid();
});
$("grid").addEventListener("click",async e=>{
  const p=e.target.closest("[data-p]"),m=e.target.closest("[data-m]"),x=p||m; if(!x||!canEdit())return;
  const [ns,v]=(p?p.dataset.p:m.dataset.m).split(":"),n=+ns;
  if(p){state[n][v].owned=true;state[n][v].duplicates=Math.max(0,state[n][v].duplicates)+1;}
  else state[n][v].duplicates=Math.max(0,state[n][v].duplicates-1);
  await persistVariant(n,v);renderGrid();
});
["q","status","variant","category"].forEach(id=>$(id).addEventListener(id==="q"?"input":"change",renderGrid));
$("compareUser").addEventListener("change",e=>compareWith(e.target.value));
$("refreshMatchesBtn").onclick=loadUsers;
$("matchesList").addEventListener("click",e=>{const b=e.target.closest("[data-propose-user]");if(b)proposeTrade(b.dataset.proposeUser);});
$("compareProposeBtn").onclick=()=>comparedUserId&&proposeTrade(comparedUserId);
$("tradeRequests").addEventListener("click",e=>{
  const chat=e.target.closest("[data-open-chat]");if(chat){openChat(chat.dataset.openChat);return;}
  const action=e.target.closest("[data-trade-action]");if(action)changeTradeStatus(action.dataset.tradeId,action.dataset.tradeAction);
});
$("closeChatBtn").onclick=closeChat;
$("sendMessageBtn").onclick=sendChatMessage;
$("chatInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChatMessage();}});
$("export").onclick=()=>{
  const b=new Blob([JSON.stringify({version:3,state},null,2)],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");
  a.href=u;a.download="dragon-ball-daima-coleccion.json";a.click();URL.revokeObjectURL(u);
};
$("import").onclick=()=>$("file").click();
$("file").onchange=async e=>{
  try{
    const d=JSON.parse(await e.target.files[0].text());state=normalizeState(d.state||d.counts||d.collection||d);saveLocal();renderGrid();
    if(canEdit()&&supabase){
      const rows=localRows().map(r=>({...r,user_id:session.user.id,updated_at:new Date().toISOString()}));
      if(rows.length){const {error}=await supabase.from("collections").upsert(rows,{onConflict:"user_id,card_number,variant"});if(error)throw error;}
      toast("Copia importada y sincronizada.");
    }else toast("Copia importada en este navegador.");
  }catch(err){toast("Archivo no válido o no se pudo importar.",true)}
  e.target.value="";
};

function setAuthMode(mode){
  const signup=mode==="signup",login=mode==="login",forgot=mode==="forgot",recovery=mode==="recovery";
  $("signupView").hidden=!signup;
  $("loginView").hidden=!login;
  $("forgotView").hidden=!forgot;
  $("recoveryView").hidden=!recovery;
  $("showSignup").classList.toggle("active",signup);
  $("showLogin").classList.toggle("active",login);
  $("authGate").hidden=false;
  $("appShell").hidden=true;
  $("signupMessage").textContent="";
  $("signupMessage").classList.remove("confirmation-notice");
  $("loginMessage").textContent="";
  $("forgotMessage").textContent="";
  $("recoveryMessage").textContent="";
}
$("showSignup").onclick=()=>setAuthMode("signup");
$("showLogin").onclick=()=>setAuthMode("login");
$("forgotLink").onclick=()=>{
  $("forgotEmail").value=$("loginEmail").value.trim();
  setAuthMode("forgot");
};
$("backToLoginFromForgot").onclick=()=>setAuthMode("login");

$("loginBtn").onclick=async()=>{
  if(!backendReady)return toast("El registro de usuarios todavía no está conectado al servidor.",true);
  const email=$("loginEmail").value.trim(),password=$("loginPassword").value;
  $("loginMessage").textContent="";
  if(!email||!password){$("loginMessage").textContent="Escribe tu email y contraseña.";return;}
  $("loginBtn").disabled=true;
  $("loginMessage").textContent="Iniciando sesión…";
  try{
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error)throw error;
    $("loginMessage").textContent="Entrando al catálogo…";
  }catch(error){
    $("loginMessage").textContent=error.code==="email_not_confirmed"
      ?"Confirma tu email antes de iniciar sesión. Revisa también la carpeta de spam."
      :"No se pudo iniciar sesión: "+error.message;
  }finally{$("loginBtn").disabled=false;}
};
$("signupBtn").onclick=async()=>{
  if(!backendReady)return toast("El registro de usuarios todavía no está conectado al servidor.",true);
  const username=$("regUsername").value.trim(),email=$("regEmail").value.trim(),password=$("regPassword").value;
  $("signupMessage").textContent="";
  $("signupMessage").classList.remove("confirmation-notice");
  if(username.length<3){$("signupMessage").textContent="El nombre de usuario debe tener al menos 3 caracteres.";return;}
  if(!email||!$("regEmail").checkValidity()){$("signupMessage").textContent="Escribe un email válido.";return;}
  if(password.length<6){$("signupMessage").textContent="La contraseña debe tener al menos 6 caracteres.";return;}
  $("signupBtn").disabled=true;
  $("signupMessage").textContent="Creando tu cuenta…";
  try{
  const {data,error}=await supabase.auth.signUp({
    email,
    password,
    options:{
      data:{username},
      emailRedirectTo:location.origin+location.pathname
    }
  });
  if(error){
    $("signupMessage").textContent=error.message.toLowerCase().includes("duplicate")||error.message.toLowerCase().includes("already")
      ?"Ese email o nombre de usuario ya está registrado."
      :"No se pudo crear la cuenta: "+error.message;
    return;
  }
  if(!data.session){
    $("signupMessage").classList.add("confirmation-notice");
    $("signupMessage").innerHTML='<strong>Recuerda revisar el correo</strong><span>Te hemos enviado un enlace para confirmar tu cuenta. Revisa también la carpeta de <b>SPAM o correo no deseado</b>.</span><span>Abre el enlace del correo y después inicia sesión para entrar al catálogo.</span>';
    $("signupMessage").scrollIntoView({behavior:"smooth",block:"nearest"});
  }else{
    $("signupMessage").textContent="Cuenta creada. Entrando al catálogo…";
  }
  }catch(error){
    $("signupMessage").textContent="No se pudo crear la cuenta: "+error.message;
  }finally{$("signupBtn").disabled=false;}
};
$("forgotBtn").onclick=async()=>{
  if(!backendReady)return;
  const email=$("forgotEmail").value.trim();
  $("forgotMessage").textContent="";
  if(!email||!$("forgotEmail").checkValidity()){
    $("forgotMessage").textContent="Escribe un email válido.";
    return;
  }
  $("forgotBtn").disabled=true;
  $("forgotMessage").textContent="Enviando enlace…";
  try{
    const redirectTo=location.origin+location.pathname;
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo});
    if(error)throw error;
    $("forgotMessage").innerHTML="<strong>Revisa tu correo.</strong><br>Si existe una cuenta con ese email, recibirás un enlace para cambiar la contraseña. Revisa también spam o correo no deseado.";
  }catch(error){
    $("forgotMessage").textContent="No se pudo enviar el enlace: "+error.message;
  }finally{
    $("forgotBtn").disabled=false;
  }
};

$("resetPasswordBtn").onclick=async()=>{
  if(!backendReady||!recoveryMode)return;
  const p1=$("newPassword").value,p2=$("newPassword2").value;
  $("recoveryMessage").textContent="";
  if(p1.length<6){
    $("recoveryMessage").textContent="La contraseña debe tener al menos 6 caracteres.";
    return;
  }
  if(p1!==p2){
    $("recoveryMessage").textContent="Las contraseñas no coinciden.";
    return;
  }
  $("resetPasswordBtn").disabled=true;
  $("recoveryMessage").textContent="Guardando nueva contraseña…";
  try{
    const {error}=await supabase.auth.updateUser({password:p1});
    if(error)throw error;
    recoveryMode=false;
    await supabase.auth.signOut();
    setAuthMode("login");
    $("loginMessage").textContent="Contraseña actualizada. Ya puedes iniciar sesión con la nueva contraseña.";
    history.replaceState({},document.title,location.pathname);
  }catch(error){
    $("recoveryMessage").textContent="No se pudo cambiar la contraseña: "+error.message;
  }finally{
    $("resetPasswordBtn").disabled=false;
  }
};

$("logoutBtn").onclick=async()=>{if(supabase)await supabase.auth.signOut()};

async function loadCatalog(){
  if(catalog.length)return;
  try{
    const r=await fetch("catalog.json",{cache:"no-store"});
    if(!r.ok)throw new Error();
    catalog=await r.json();
  }catch{
    $("grid").innerHTML='<div class="empty">No se pudo cargar el catálogo.</div>';
    throw new Error("catalog");
  }
}
async function handleSession(newSession){
  session=newSession; profile=null;
  if(session?.user){
    await loadCatalog();
    await loadProfile();
    renderSession();
    await syncAccount();
    await loadUsers();
    await loadTrades();
    await subscribeTradeRealtime();
  }else{
    await cleanupTradeRealtime();
    renderSession();
  }
}
async function boot(){
  setAuthMode("signup");
  if(!backendReady){
    $("signupMessage").textContent="El servicio de usuarios no está disponible en este momento.";
    $("signupBtn").disabled=true;
    $("loginBtn").disabled=true;
    return;
  }

  supabase.auth.onAuthStateChange((event,newSession)=>{
    if(event==="PASSWORD_RECOVERY"){
      recoveryMode=true;
      session=newSession;
      profile=null;
      setAuthMode("recovery");
      return;
    }
    // Supabase holds its auth lock while notifying listeners. Run database
    // requests after the callback returns, otherwise sign-in can deadlock.
    setTimeout(()=>{
      if(recoveryMode)return;
      if(newSession?.user?.id!==session?.user?.id||Boolean(newSession)!==Boolean(session)){
        handleSession(newSession).catch(showSessionError);
      }
    },0);
  });

  const looksLikeRecovery=location.hash.includes("type=recovery");
  const {data:{session:initial}}=await supabase.auth.getSession();
  if(looksLikeRecovery){
    recoveryMode=true;
    session=initial;
    setAuthMode("recovery");
  }else{
    await handleSession(initial);
  }
}
function showSessionError(error){
  const message="No se pudo cargar tu cuenta. Recarga la página para reintentarlo: "+error.message;
  $("signupMessage").textContent=message;
  $("loginMessage").textContent=message;
  toast(message,true);
}
boot().catch(showSessionError);
