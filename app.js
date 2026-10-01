import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const LOCAL_KEY="db-daima-checklist-imagenes-v2";
const $=id=>document.getElementById(id);
const backendReady=Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const supabase=backendReady?createClient(SUPABASE_URL,SUPABASE_ANON_KEY):null;

let catalog=[];
let state=loadLocal();
let session=null;
let profile=null;
let otherUsers=[];

const variants=n=>n<=100?["basic","crystal","rainbow"]:["basic"];
const blankVariant=()=>({owned:false,duplicates:0});
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
  $("editNotice").classList.toggle("hidden",canEdit());
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
  const {data,error}=await supabase.from("profiles").select("id,username").neq("id",session.user.id).order("username");
  if(error){toast("No se pudieron cargar los usuarios: "+error.message,true);return;}
  otherUsers=data||[];
  $("compareUser").innerHTML='<option value="">Selecciona un usuario</option>'+otherUsers.map(u=>`<option value="${u.id}">${escapeHtml(u.username)}</option>`).join("");
  $("compareUser").disabled=false;
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
function renderSession(){
  const signed=canEdit();
  $("signedOut").hidden=signed; $("signedIn").hidden=!signed; $("compareLocked").hidden=signed;
  $("sessionPill").classList.toggle("online",signed);
  $("sessionPill").textContent=signed?(profile?.username||session.user.email||"Conectado"):"Sin iniciar sesión";
  if(signed){$("currentUsername").textContent=profile?.username||"Usuario"; $("currentEmail").textContent=session.user.email||"";}
  $("compareUser").disabled=!signed;
  if(!signed){$("compareResults").hidden=true;$("compareUser").innerHTML='<option value="">Selecciona un usuario</option>';}
  renderGrid();
}
async function handleSession(newSession){
  session=newSession; profile=null;
  if(session?.user){await loadProfile();renderSession();await syncAccount();await loadUsers();}
  else renderSession();
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
  if(!userId||!canEdit()||!supabase){$("compareResults").hidden=true;return;}
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

$("loginBtn").onclick=async()=>{
  if(!backendReady)return toast("El registro de usuarios todavía no está conectado al servidor.",true);
  const email=$("email").value.trim(),password=$("password").value;
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error)toast(error.message,true);
};
$("signupBtn").onclick=async()=>{
  if(!backendReady)return toast("El registro de usuarios todavía no está conectado al servidor.",true);
  const username=$("username").value.trim(),email=$("email").value.trim(),password=$("password").value;
  if(username.length<3)return toast("El nombre de usuario debe tener al menos 3 caracteres.",true);
  const {data,error}=await supabase.auth.signUp({email,password,options:{data:{username}}});
  if(error)return toast(error.message,true);
  if(!data.session)toast("Cuenta creada. Revisa tu email si Supabase solicita confirmación.");
  else toast("Cuenta creada.");
};
$("logoutBtn").onclick=async()=>{if(supabase)await supabase.auth.signOut()};

async function boot(){
  try{
    const r=await fetch("catalog.json",{cache:"no-store"}); if(!r.ok)throw new Error(); catalog=await r.json();
  }catch{$("grid").innerHTML='<div class="empty">No se pudo cargar el catálogo.</div>';return;}
  renderGrid();
  if(!backendReady){
    $("authPanel").querySelector(".muted").textContent="La interfaz de usuarios está preparada, pero falta conectar la base de datos.";
    $("signupBtn").disabled=true;$("loginBtn").disabled=true;
    return;
  }
  const {data:{session:initial}}=await supabase.auth.getSession(); await handleSession(initial);
  supabase.auth.onAuthStateChange(async(_event,newSession)=>{if(newSession?.user?.id!==session?.user?.id||!newSession!==!session)await handleSession(newSession)});
}
boot();
