// ============================================
// Educatif MIKN — app.js v7d
// Fix : noms élèves visibles + bureau prof + renommage table
// ============================================
const SUPABASE_URL = "https://itmvhjdblohqrgrbtaap.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0bXZoamRibG9ocXJncmJ0YWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMTMzOTcsImV4cCI6MjA4Njg4OTM5N30.Sx5e6YQwWtTiNR29-9kKfOorMKquj5dcIJN4VO4JSao";


const PLANS = {
  free:   { maxClasses:2, maxStudents:30, maxActivites:10, quiz:true, salle:false },
  pro:    { maxClasses:20, maxStudents:200, maxActivites:999, quiz:true, salle:true },
  school: { maxClasses:999, maxStudents:999, maxActivites:999, quiz:true, salle:true }
};
let currentPlan="free", currentPlanData=PLANS.free;

const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

function toast(title,msg,type="info"){
  const t=$("#toast"); if(!t) return;
  $("#toastTitle").textContent=title; $("#toastMsg").textContent=msg;
  t.className="toast show"+(type==="error"?" toast-error":type==="success"?" toast-success":"");
  clearTimeout(window.__t); window.__t=setTimeout(()=>t.classList.remove("show"),3500);
}
function applyTheme(){
  const v=localStorage.getItem("mcv_theme")||"light";
  document.documentElement.dataset.theme=v;
  const b=$("#themeBtn"); if(b) b.textContent=v==="light"?"🌙":"☀️";
}
function toggleTheme(){
  const v=(localStorage.getItem("mcv_theme")||"light")==="light"?"dark":"light";
  localStorage.setItem("mcv_theme",v); applyTheme();
}
function roleHome(r){ return {admin:"admin.html",teacher:"prof.html",parent:"parent.html"}[r]||"index.html"; }
function sbEnabled(){ return !!(SUPABASE_URL&&SUPABASE_ANON_KEY&&window.supabase); }
function sb(){
  return window.__sb||=window.supabase?.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
}
async function sbSession(){ const {data}=await sb().auth.getSession(); return data?.session||null; }
async function sbProfile(){
  const s=await sbSession(); if(!s?.user) return null;
  const {data}=await sb().from("profiles").select("*").eq("id",s.user.id).maybeSingle();
  return data;
}
async function requireRole(expected){
  const s=await sbSession(); if(!s){location.href="index.html";return null;}
  const p=await sbProfile();
  if(!p||p.role!==expected){ toast("Accès refusé","Rôle requis : "+expected,"error"); setTimeout(()=>location.href=roleHome(p?.role||expected),700); return null; }
  const who=$("#who"); if(who) who.textContent=p.full_name||p.email||"";
  currentPlan=p.plan||"free"; currentPlanData=PLANS[currentPlan]||PLANS.free;
  const pb=$("#planBadge"); if(pb){pb.textContent=currentPlan.toUpperCase();pb.className="plan-badge plan-"+currentPlan;}
  return p;
}
function bindHeader(){
  applyTheme();
  $("#themeBtn")?.addEventListener("click",toggleTheme);
  $("#logoutBtn")?.addEventListener("click",async()=>{ await sb().auth.signOut(); location.href="index.html"; });
}
function checkFeature(feat,cb){ if(currentPlanData[feat]) cb(); else showUpgradeModal(feat); }
function showUpgradeModal(feat){
  const names={salle:"le Plan de salle interactif",quiz:"les Quiz QCM avancés"};
  document.getElementById("modalUpgrade")?.remove();
  const modal=document.createElement("div"); modal.className="modal show"; modal.id="modalUpgrade";
  modal.innerHTML=`<div class="modal-content" style="max-width:420px;text-align:center;padding:30px">
    <div style="font-size:52px">🔒</div>
    <h2>Fonctionnalité Premium</h2>
    <p style="color:var(--text-muted)"><strong>${names[feat]||feat}</strong> est disponible à partir du plan <strong>Pro</strong>.</p>
    <button class="btn" onclick="document.getElementById('modalUpgrade').remove()" style="background:#f97316">Contacter pour upgrade →</button>
    <button class="btn btn-secondary" onclick="document.getElementById('modalUpgrade').remove()" style="margin-left:8px">Fermer</button>
  </div>`;
  document.body.appendChild(modal);
}

// ============================================
// INDEX
// ============================================
function initIndex(){
  applyTheme();
  const tabs=$$("[data-role]");
  const setActive=r=>{ tabs.forEach(t=>t.classList.toggle("active",t.dataset.role===r)); localStorage.setItem("mcv_role",r); };
  setActive(localStorage.getItem("mcv_role")||"teacher");
  tabs.forEach(t=>t.addEventListener("click",()=>setActive(t.dataset.role)));
  $("#themeBtn")?.addEventListener("click",toggleTheme);
  $("#loginBtn")?.addEventListener("click",async()=>{
    const email=($("#email").value||"").trim(), pass=$("#password").value||"";
    if(!email||!pass){toast("Requis","Email et mot de passe obligatoires.","error");return;}
    if(!sbEnabled()){toast("Config","Supabase non configuré.","error");return;}
    try{ const {error}=await sb().auth.signInWithPassword({email,password:pass}); if(error) throw error;
      const p=await sbProfile(); location.href=roleHome(p?.role||localStorage.getItem("mcv_role")||"teacher");
    }catch(e){toast("Erreur",e?.message||String(e),"error");}
  });
  $("#forgotBtn")?.addEventListener("click",async()=>{
    const email=($("#email").value||"").trim(); if(!email){toast("Email requis","","error");return;}
    try{ const {error}=await sb().auth.resetPasswordForEmail(email,{redirectTo:location.origin+"/reset.html"});
      if(error) throw error; toast("Email envoyé","Vérifie ta boîte mail.","success");
    }catch(e){toast("Erreur",e?.message||String(e),"error");}
  });
  (async()=>{ if(!sbEnabled()) return; const s=await sbSession(); if(s){ const p=await sbProfile().catch(()=>null); if(p?.role) location.href=roleHome(p.role); } })();
}

// ============================================
// PROFESSEUR
// ============================================
let currentTeacherId=null;

async function initProf(){
  bindHeader();
  const profile=await requireRole("teacher"); if(!profile) return;
  currentTeacherId=profile.id;
  $$(".nav-item").forEach(item=>item.addEventListener("click",e=>{e.preventDefault();switchToView(item.dataset.view);}));
  setupModalListeners(profile.id);
  setupConfirmModal();
  await loadDashboard(profile.id);
  await loadUnreadMessages(profile.id);
}
window.switchToView=function(viewName){
  $$(".nav-item").forEach(i=>i.classList.toggle("active",i.dataset.view===viewName));
  $$(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+viewName));
  const titles={
    dashboard:{t:"Tableau de bord",s:"Vue rapide"},classes:{t:"Mes classes",s:"Créer, modifier"},
    eleves:{t:"Élèves",s:"Gérer tes élèves"},plan:{t:"Plan de salle",s:"Organiser ta classe"},
    evaluations:{t:"Évaluations & Quiz",s:"Créer et noter"},activites:{t:"Activités",s:"Devoirs et exercices"},
    parents:{t:"Parents",s:"Communication"},messages:{t:"Messages",s:"Boîte de réception"}
  };
  const i=titles[viewName]||{t:viewName,s:""};
  if($("#pageTitle"))    $("#pageTitle").textContent=i.t;
  if($("#pageSubtitle")) $("#pageSubtitle").textContent=i.s;
  if(viewName==="classes")     loadClasses(currentTeacherId);
  if(viewName==="eleves")      loadEleves(currentTeacherId);
  if(viewName==="evaluations") loadEvaluations(currentTeacherId);
  if(viewName==="activites")   loadActivites(currentTeacherId);
  if(viewName==="plan")        checkFeature("salle",()=>loadPlanDeSalle(currentTeacherId));
};
async function loadUnreadMessages(tid){
  try{ const {count}=await sb().from("messages").select("id",{count:"exact",head:true}).eq("recipient_id",tid).eq("read",false);
    const b=$("#msgBadge"); if(b){b.style.display=count>0?"inline-block":"none";if(count>0)b.textContent=count;}
  }catch(e){}
}

// ---- DASHBOARD ----
async function loadDashboard(tid){
  await loadDashboardStats(tid);
  await loadRecentEvaluations(tid);
  renderDashboardShortcuts();
}
function renderDashboardShortcuts(){
  const c=$("#dashShortcuts"); if(!c) return;
  const sc=[
    {icon:"📝",label:"Créer une éval",   color:"#3b82f6", fn:"()=>document.getElementById('btnAddEvalDash').click()"},
    {icon:"✏️",label:"Créer activité",   color:"#f97316", fn:"()=>{switchToView('activites');setTimeout(()=>document.getElementById('btnAddActivite')?.click(),250)}"},
    {icon:"👥",label:"Ajouter un élève", color:"#16a34a", fn:"()=>{switchToView('eleves');setTimeout(()=>document.getElementById('btnAddEleve')?.click(),250)}"},
    {icon:"📚",label:"Créer une classe", color:"#8b5cf6", fn:"()=>{switchToView('classes');setTimeout(()=>document.getElementById('btnAddClass')?.click(),250)}"},
    {icon:"🏛️",label:"Plan de salle",   color:"#0ea5e9", fn:"()=>switchToView('plan')"},
  ];
  c.innerHTML=sc.map(s=>`<button onclick="(${s.fn})()" style="
    display:flex;flex-direction:column;align-items:center;gap:6px;
    padding:16px 12px;border-radius:14px;border:none;cursor:pointer;
    background:var(--bg-card);transition:transform .15s,box-shadow .15s;
    box-shadow:0 1px 6px rgba(0,0,0,.07);flex:1;min-width:90px;max-width:140px"
    onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 16px rgba(0,0,0,.12)'"
    onmouseout="this.style.transform='';this.style.boxShadow='0 1px 6px rgba(0,0,0,.07)'">
    <span style="font-size:26px;width:46px;height:46px;display:flex;align-items:center;justify-content:center;
      background:${s.color}18;border-radius:12px">${s.icon}</span>
    <span style="font-size:11px;font-weight:600;color:var(--text);text-align:center;line-height:1.3">${s.label}</span>
  </button>`).join('');
}
async function loadDashboardStats(tid){
  try{
    const [{data:cls},{data:elv},{data:act}]=await Promise.all([
      sb().from("classes").select("id").eq("teacher_id",tid),
      sb().from("students").select("id").eq("teacher_id",tid),
      sb().from("activities").select("id").eq("teacher_id",tid)
    ]);
    if($("#stat-classes"))   $("#stat-classes").textContent=cls?.length||0;
    if($("#stat-eleves"))    $("#stat-eleves").textContent=elv?.length||0;
    if($("#stat-activites")) $("#stat-activites").textContent=act?.length||0;
  }catch(e){}
}
async function loadRecentEvaluations(tid){
  try{ const {data}=await sb().from("evaluations").select("*,classes(name)").eq("teacher_id",tid).order("eval_date",{ascending:false}).limit(5);
    const tbody=$("#recentEvaluations"); if(!tbody) return;
    if(!data?.length){tbody.innerHTML='<tr><td colspan="4" class="table-empty">Aucune évaluation</td></tr>';return;}
    tbody.innerHTML=data.map(e=>`<tr><td>${e.title}</td><td><span class="badge-blue">${e.subject||'-'}</span></td><td>${e.eval_type||'standard'} / ${e.max_score||20}</td><td>${e.eval_date?new Date(e.eval_date).toLocaleDateString('fr-FR'):'-'}</td></tr>`).join('');
  }catch(e){}
}

// ---- CLASSES ----
async function loadClasses(tid){
  try{ const {data,error}=await sb().from("classes").select("id,name,school_year").eq("teacher_id",tid).order("name");
    if(error) throw error;
    const container=$("#classesList"); if(!container) return;
    if(!data?.length){container.innerHTML='<p class="panel-empty">Aucune classe créée.</p>';return;}
    container.innerHTML=data.map(cl=>`<div class="list-item">
      <div><div style="font-weight:700">${cl.name}</div><div style="font-size:13px;color:var(--text-muted)">${cl.school_year||'2025-2026'}</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" style="font-size:13px" onclick="openEditClass('${cl.id}','${cl.name.replace(/'/g,"\\'")}','${cl.school_year||''}')">✏️</button>
        <button class="btn" style="font-size:13px;background:#ef4444" onclick="confirmDeleteClass('${cl.id}','${cl.name.replace(/'/g,"\\'")}')">🗑</button>
      </div>
    </div>`).join('');
  }catch(e){toast("Erreur",e.message,"error");}
}
window.openEditClass=function(id,name,year){
  if($("#modalClassTitle")) $("#modalClassTitle").textContent="Modifier la classe";
  if($("#classId")) $("#classId").value=id;
  if($("#className")) $("#className").value=name;
  if($("#classYear")) $("#classYear").value=year;
  $("#modalClass").classList.add("show");
};
window.confirmDeleteClass=function(id,name){
  $("#confirmText").textContent=`Supprimer "${name}" ?`;
  $("#btnConfirmDelete").onclick=()=>deleteClass(id); $("#modalConfirm").classList.add("show");
};
async function deleteClass(id){
  try{ await sb().from("students").update({class_id:null}).eq("class_id",id);
    const {error}=await sb().from("classes").delete().eq("id",id); if(error) throw error;
    $("#modalConfirm").classList.remove("show"); toast("Supprimé","✅","success");
    await loadClasses(currentTeacherId); await loadDashboardStats(currentTeacherId);
  }catch(e){toast("Erreur",e.message,"error");}
}
async function saveClass(tid){
  const id=$("#classId").value, name=$("#className").value.trim(), year=($("#classYear")?.value||"2025-2026").trim();
  if(!name){toast("Erreur","Nom requis","error");return;}
  try{
    if(id){ await sb().from("classes").update({name,school_year:year}).eq("id",id); }
    else   { await sb().from("classes").insert({name,school_year:year,teacher_id:tid,tenant_id:tid}); }
    toast("Succès","✅","success"); $("#modalClass").classList.remove("show");
    await loadClasses(tid); await loadDashboardStats(tid);
  }catch(e){toast("Erreur",e.message,"error");}
}

// ---- ÉLÈVES ----
async function loadEleves(tid){
  await populateClassSelect("filterClass",tid,true);
  const sel=$("#filterClass");
  sel?.removeEventListener("change",sel.__h||null); sel.__h=()=>loadElevesList(tid); sel?.addEventListener("change",sel.__h);
  await loadElevesList(tid);
}
async function loadElevesList(tid){
  const fid=$("#filterClass")?.value;
  try{ let q=sb().from("students").select("*,classes(name)").eq("teacher_id",tid).order("last_name");
    if(fid) q=q.eq("class_id",fid);
    const {data,error}=await q; if(error) throw error;
    const container=$("#elevesList"); if(!container) return;
    if(!data?.length){container.innerHTML='<p class="panel-empty">Aucun élève.</p>';return;}
    container.innerHTML=data.map(e=>`<div class="list-item">
      <div><div style="font-weight:700">${e.first_name} ${e.last_name}</div><div style="font-size:13px;color:var(--text-muted)">${e.classes?.name||'Non assigné'}</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" style="font-size:13px" onclick="openFicheEleve('${e.id}','${(e.first_name+' '+e.last_name).replace(/'/g,"\\'")}','${(e.classes?.name||'').replace(/'/g,"\\'")}')">📋 Fiche</button>
        <button class="btn" style="font-size:13px;background:#ef4444" onclick="confirmDeleteEleve('${e.id}','${(e.first_name+' '+e.last_name).replace(/'/g,"\\'")}')">🗑</button>
      </div>
    </div>`).join('');
  }catch(e){toast("Erreur",e.message,"error");}
}
window.confirmDeleteEleve=function(id,name){
  $("#confirmText").textContent=`Supprimer "${name}" ?`;
  $("#btnConfirmDelete").onclick=()=>deleteEleve(id); $("#modalConfirm").classList.add("show");
};
async function deleteEleve(id){
  try{ await sb().from("students").delete().eq("id",id);
    $("#modalConfirm").classList.remove("show"); toast("Supprimé","✅","success");
    await loadElevesList(currentTeacherId); await loadDashboardStats(currentTeacherId);
  }catch(e){toast("Erreur",e.message,"error");}
}
async function saveEleve(tid){
  const fn=$("#eleveFirstName").value.trim(), ln=$("#eleveLastName").value.trim(), cid=$("#eleveClassId").value;
  if(!fn||!ln){toast("Erreur","Prénom et nom requis","error");return;}
  try{ await sb().from("students").insert({first_name:fn,last_name:ln,class_id:cid||null,teacher_id:tid,tenant_id:tid});
    $("#modalEleve").classList.remove("show"); $("#eleveFirstName").value=""; $("#eleveLastName").value="";
    toast("Succès","Élève ajouté ✅","success"); await loadElevesList(tid); await loadDashboardStats(tid);
  }catch(e){toast("Erreur",e.message,"error");}
}

// ============================================
// PLAN DE SALLE v7d — CANVAS LIBRE
// ✅ Fix : noms visibles + bureau décoratif + renommage
// ============================================
let salleClassId=null, salleLayout=[], salleEleves=[];
let salleDragTable=null, salleDragStudent=null;
let salleTableDragOffsetX=0, salleTableDragOffsetY=0;

const TABLE_TYPES={
  "bureau_prof":  {label:"Bureau Prof",    seats:0, icon:"🖥"},
  "table_2":      {label:"Table 2 places", seats:2, icon:"📐"},
  "table_4":      {label:"Îlot 4 places",  seats:4, icon:"⬛"},
  "table_6":      {label:"Îlot 6 places",  seats:6, icon:"⬛"},
  "rangee_simple":{label:"Place seule",    seats:1, icon:"▭"},
};

async function loadPlanDeSalle(tid){
  const container=$("#planContainer"); if(!container) return;
  await populateClassSelect("planClassSelect",tid,false);
  const sel=$("#planClassSelect");
  sel?.removeEventListener("change",sel.__salleH||null);
  sel.__salleH=async()=>{ salleClassId=sel.value; if(salleClassId) await initSalle(tid); else container.innerHTML='<p style="text-align:center;padding:60px;color:var(--text-muted)">Sélectionnez une classe.</p>'; };
  sel?.addEventListener("change",sel.__salleH);
  if(sel?.value){ salleClassId=sel.value; await initSalle(tid); }
  else container.innerHTML='<p style="text-align:center;padding:60px;color:var(--text-muted)">Sélectionnez une classe.</p>';
}
async function initSalle(tid){
  const container=$("#planContainer"); if(!container) return;
  const [{data:cls},{data:eleves}]=await Promise.all([
    sb().from("classes").select("room_layout,name").eq("id",salleClassId).maybeSingle(),
    sb().from("students").select("id,first_name,last_name").eq("class_id",salleClassId).eq("teacher_id",tid).order("last_name")
  ]);
  salleLayout=Array.isArray(cls?.room_layout)?cls.room_layout:[];
  salleEleves=eleves||[];
  renderSalle(tid);
}

// ✅ Fonction principale de rendu — entièrement synchrone, pas de setTimeout
function renderSalle(tid){
  const container=document.getElementById("planContainer");
  if(!container) return;

  // ---- Map élèves ----
  const studentMap={};
  salleEleves.forEach(e=>{
    studentMap[e.id]={ id:e.id, first:String(e.first_name||""), last:String(e.last_name||"") };
  });

  // ---- Map place occupée ----
  const seatOccupied={};
  salleLayout.forEach(table=>{
    (table.seats||[]).forEach(seat=>{
      if(seat.studentId) seatOccupied[table.id+"|"+seat.pos]=String(seat.studentId);
    });
  });
  const placedIds=new Set(Object.values(seatOccupied));
  const unplaced=salleEleves.filter(e=>!placedIds.has(String(e.id)));

  // ---- Construction HTML tables ----
  let tablesHtml="";
  salleLayout.forEach((table,tIdx)=>{
    const def=TABLE_TYPES[table.type]||{seats:1,icon:"▭",label:table.type};
    const isBureau=(table.type==="bureau_prof");
    const left=((table.xp??2))+"%";
    const top =((table.yp??5))+"%";
    const cols=isBureau?1:(def.seats<=2?def.seats:Math.ceil(def.seats/2));
    const minW=isBureau?180:(cols*92);

    let seatsGrid="";
    if(isBureau){
      seatsGrid=`<div style="
        display:flex;align-items:center;justify-content:center;
        min-height:52px;border-radius:8px;padding:10px 16px;
        background:linear-gradient(135deg,#1e293b,#334155);
        color:#fff;font-size:13px;font-weight:700;letter-spacing:1px;gap:6px">
        🧑‍🏫 Professeur
      </div>`;
    } else {
      seatsGrid=`<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:5px">`;
      (table.seats||[]).forEach((seat,sIdx)=>{
        const key=table.id+"|"+seat.pos;
        const sid=seatOccupied[key]||null;
        const stu=sid?studentMap[sid]:null;
        if(stu){
          // ✅ Noms forcément en blanc sur fond bleu — valeurs lues directement depuis studentMap
          seatsGrid+=`<div
            draggable="true"
            ondragstart="event.stopPropagation();salleDragStudent='${stu.id}';event.dataTransfer.setData('text','student')"
            ondragover="event.preventDefault();event.stopPropagation()"
            ondrop="event.preventDefault();event.stopPropagation();salle_dropSeat(${tIdx},${sIdx},'${tid}')"
            onclick="event.stopPropagation();openFicheEleve('${stu.id}','${(stu.first+" "+stu.last).replace(/'/g,"\\'")}','')"
            style="position:relative;border-radius:7px;padding:5px 4px;cursor:grab;
              background:#2563eb;
              min-width:80px;min-height:54px;
              display:flex;flex-direction:column;
              align-items:center;justify-content:center;text-align:center">
            <span style="font-size:12px;font-weight:800;color:#FFFFFF;line-height:1.3;
              display:block;width:100%;text-align:center;word-break:break-word">${stu.first}</span>
            <span style="font-size:10px;color:#BFDBFE;line-height:1.2;
              display:block;width:100%;text-align:center;word-break:break-word">${stu.last}</span>
            <span onclick="event.stopPropagation();salle_unseat(${tIdx},${sIdx},'${tid}')"
              style="position:absolute;top:2px;right:3px;font-size:11px;
              color:#FCA5A5;cursor:pointer;line-height:1;font-weight:700">✕</span>
          </div>`;
        } else {
          seatsGrid+=`<div
            ondragover="event.preventDefault();event.stopPropagation()"
            ondrop="event.preventDefault();event.stopPropagation();salle_dropSeat(${tIdx},${sIdx},'${tid}')"
            onclick="event.stopPropagation();salle_pickStudent(${tIdx},${sIdx},'${tid}')"
            style="border-radius:7px;padding:5px;
              background:var(--bg-main);border:2px dashed var(--border);
              min-width:80px;min-height:54px;
              display:flex;align-items:center;justify-content:center;
              cursor:pointer;color:var(--text-muted);font-size:22px;opacity:.5">
            ＋
          </div>`;
        }
      });
      seatsGrid+=`</div>`;
    }

    tablesHtml+=`<div
      style="position:absolute;left:${left};top:${top};
        background:var(--bg-card);border:2px solid var(--border);border-radius:12px;
        padding:8px 10px;cursor:move;z-index:10;
        box-shadow:0 3px 10px rgba(0,0,0,.15);min-width:${minW}px"
      draggable="true"
      ondragstart="event.stopPropagation();salleDragTable=${tIdx};salleTableDragOffsetX=event.offsetX;salleTableDragOffsetY=event.offsetY;event.dataTransfer.setData('text','table')"
      ondragover="event.preventDefault()"
      ondrop="event.preventDefault();event.stopPropagation()">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:4px">
        <span style="font-size:10px;font-weight:700;color:var(--text-muted);flex:1;cursor:pointer"
          title="Double-clic pour renommer"
          ondblclick="event.stopPropagation();salle_renameTable(${tIdx},'${tid}')">
          ${def.icon} ${table.label||def.label}
        </span>
        <span style="font-size:9px;opacity:.35;margin-right:2px" title="Double-clic sur le nom pour renommer">✏️</span>
        <button onclick="event.stopPropagation();salle_removeTable(${tIdx},'${tid}')"
          style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:11px;padding:0;line-height:1">✕</button>
      </div>
      ${seatsGrid}
    </div>`;
  });

  // ---- Construction HTML complet ----
  const toolbar=`<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
    <span style="font-weight:700;font-size:12px;color:var(--text-muted)">➕ Ajouter :</span>
    ${Object.entries(TABLE_TYPES).map(([type,def])=>`
      <button class="btn btn-secondary" style="font-size:11px;padding:5px 10px"
        onclick="salle_addTable('${type}','${tid}')">
        ${def.icon} ${def.label}
      </button>`).join("")}
    <div style="margin-left:auto;display:flex;gap:6px">
      <button class="btn" style="font-size:11px;padding:5px 10px;background:#ef4444" onclick="salle_clear('${tid}')">🗑 Vider</button>
      <button class="btn" style="font-size:11px;padding:5px 10px;background:#16a34a" onclick="salle_save()">💾 Enregistrer</button>
    </div>
  </div>`;

  const bandeau=`<div style="background:linear-gradient(135deg,#1e293b,#334155);color:#fff;text-align:center;
    padding:10px;border-radius:10px;margin-bottom:10px;font-size:12px;letter-spacing:2px;font-weight:600">
    🖥 TABLEAU / BUREAU DU PROFESSEUR
  </div>`;

  const canvas=`<div id="salleCanvas"
    style="position:relative;width:100%;min-height:560px;
      background:var(--bg-main);border:2px dashed var(--border);border-radius:14px;overflow:hidden"
    ondragover="event.preventDefault()"
    ondrop="salle_dropCanvas(event,'${tid}')">
    ${salleLayout.length===0?`<p style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      color:var(--text-muted);font-size:14px;pointer-events:none;text-align:center;line-height:2">
      Ajoute des tables ci-dessus,<br>puis glisse-les où tu veux</p>`:""}
    ${tablesHtml}
  </div>`;

  const unplacedSection=unplaced.length>0?`<div style="margin-top:14px">
    <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--text-muted)">
      👥 Élèves non placés — glisse ou clique ＋
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${unplaced.map(e=>`<div class="seat-unplaced" draggable="true"
        ondragstart="salleDragStudent='${e.id}';event.dataTransfer.setData('text','student')">
        ${e.first_name} ${e.last_name}
      </div>`).join("")}
    </div>
  </div>`:"";

  container.innerHTML=toolbar+bandeau+canvas+unplacedSection;
}

// ---- Actions plan de salle ----
window.salle_addTable=function(type,tid){
  const id="t_"+Date.now();
  const def=TABLE_TYPES[type];
  const seats=def.seats>0?Array.from({length:def.seats},(_,i)=>({pos:i,studentId:null})):[];
  const used=salleLayout.map(t=>({x:t.xp||0,y:t.yp||0}));
  let xp=3,yp=3,tries=0;
  while(used.some(p=>Math.abs(p.x-xp)<26&&Math.abs(p.y-yp)<22)&&tries<20){xp=(xp+27)%62;if(xp<3)yp=(yp+24)%62;tries++;}
  salleLayout.push({id,type,label:def.label,xp,yp,seats});
  renderSalle(tid);
};
window.salle_removeTable=function(tIdx,tid){ salleLayout.splice(tIdx,1); renderSalle(tid); };
window.salle_clear=async function(tid){
  if(!confirm("Vider toute la salle ?")) return;
  salleLayout=[]; await salle_save(); renderSalle(tid);
};
window.salle_save=async function(){
  if(!salleClassId) return;
  try{ const {error}=await sb().from("classes").update({room_layout:salleLayout}).eq("id",salleClassId);
    if(error) throw error; toast("Enregistré","Plan sauvegardé ✅","success");
  }catch(e){toast("Erreur",e.message,"error");}
};
window.salle_dropCanvas=function(event,tid){
  if(salleDragTable===null) return;
  const canvas=document.getElementById("salleCanvas"); if(!canvas) return;
  const rect=canvas.getBoundingClientRect();
  const xPct=Math.max(0,Math.min(82,((event.clientX-rect.left-salleTableDragOffsetX)/rect.width)*100));
  const yPct=Math.max(0,Math.min(82,((event.clientY-rect.top -salleTableDragOffsetY)/rect.height)*100));
  salleLayout[salleDragTable].xp=Math.round(xPct*10)/10;
  salleLayout[salleDragTable].yp=Math.round(yPct*10)/10;
  salleDragTable=null;
  renderSalle(tid);
};
// ✅ Drop élève : 100% synchrone, pas de setTimeout, lecture directe depuis salleLayout
window.salle_dropSeat=function(tIdx,sIdx,tid){
  const sid=salleDragStudent; if(!sid) return;
  salleDragStudent=null;
  salleLayout.forEach(t=>{ (t.seats||[]).forEach(s=>{ if(String(s.studentId)===String(sid)) s.studentId=null; }); });
  const seat=salleLayout[tIdx]?.seats?.[sIdx];
  if(seat) seat.studentId=sid;
  renderSalle(tid);
};
window.salle_unseat=function(tIdx,sIdx,tid){
  const seat=salleLayout[tIdx]?.seats?.[sIdx];
  if(seat) seat.studentId=null;
  renderSalle(tid);
};
window.salle_pickStudent=function(tIdx,sIdx,tid){
  const placed=new Set();
  salleLayout.forEach(t=>(t.seats||[]).forEach(s=>{ if(s.studentId) placed.add(String(s.studentId)); }));
  const unplaced=salleEleves.filter(e=>!placed.has(String(e.id)));
  if(!unplaced.length){toast("Info","Tous les élèves sont déjà placés.");return;}
  document.getElementById("seatPickerModal")?.remove();
  const modal=document.createElement("div");
  modal.className="modal show"; modal.id="seatPickerModal";
  modal.innerHTML=`<div class="modal-content" style="max-width:340px">
    <div class="modal-header"><h2>Placer un élève</h2>
      <button class="modal-close" onclick="document.getElementById('seatPickerModal').remove()">✕</button>
    </div>
    <div class="modal-body" style="max-height:300px;overflow-y:auto">
      ${unplaced.map(e=>`<div class="list-item" style="cursor:pointer"
        onclick="salle_placeFromPicker('${e.id}',${tIdx},${sIdx},'${tid}')">
        <div style="font-weight:600">${e.first_name} ${e.last_name}</div>
      </div>`).join("")}
    </div>
  </div>`;
  document.body.appendChild(modal);
};
window.salle_placeFromPicker=function(studentId,tIdx,sIdx,tid){
  document.getElementById("seatPickerModal")?.remove();
  salleLayout.forEach(t=>(t.seats||[]).forEach(s=>{ if(String(s.studentId)===String(studentId)) s.studentId=null; }));
  const seat=salleLayout[tIdx]?.seats?.[sIdx];
  if(seat) seat.studentId=studentId;
  renderSalle(tid);
};
// ✅ Renommer table — double-clic sur le label
window.salle_renameTable=function(tIdx,tid){
  const table=salleLayout[tIdx]; if(!table) return;
  document.getElementById("renameTableModal")?.remove();
  const modal=document.createElement("div");
  modal.className="modal show"; modal.id="renameTableModal";
  modal.innerHTML=`<div class="modal-content" style="max-width:340px">
    <div class="modal-header">
      <h2>✏️ Renommer la table</h2>
      <button class="modal-close" onclick="document.getElementById('renameTableModal').remove()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Nom de la table</label>
        <input type="text" id="renameTableInput" class="input"
          value="${(table.label||"").replace(/"/g,"&quot;")}"
          placeholder="Ex : Groupe A"
          onkeydown="if(event.key==='Enter') salle_confirmRename(${tIdx},'${tid}')">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="document.getElementById('renameTableModal').remove()">Annuler</button>
      <button class="btn" onclick="salle_confirmRename(${tIdx},'${tid}')">Renommer</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  setTimeout(()=>{ const inp=document.getElementById("renameTableInput"); if(inp){inp.focus();inp.select();} },80);
};
window.salle_confirmRename=function(tIdx,tid){
  const val=(document.getElementById("renameTableInput")?.value||"").trim();
  if(!val){toast("Erreur","Le nom ne peut pas être vide","error");return;}
  salleLayout[tIdx].label=val;
  document.getElementById("renameTableModal")?.remove();
  renderSalle(tid);
};

// ============================================
// FICHE ÉLÈVE
// ============================================
let currentFicheEleveId=null, currentFicheEvalId=null, currentQuizEval=null;

window.openFicheEleve=async function(eleveId,eleveName,eleveClass){
  document.getElementById("seatPickerModal")?.remove();
  currentFicheEleveId=eleveId;
  if($("#ficheEleveName"))  $("#ficheEleveName").textContent=eleveName;
  if($("#ficheEleveClass")) $("#ficheEleveClass").textContent=eleveClass||"";
  if($("#ficheEleveId"))    $("#ficheEleveId").value=eleveId;
  switchFicheTab("notes");
  const {data:el}=await sb().from("students").select("*,classes(name)").eq("id",eleveId).maybeSingle();
  if(el){
    if($("#infoFirstName"))   $("#infoFirstName").value=el.first_name||"";
    if($("#infoLastName"))    $("#infoLastName").value=el.last_name||"";
    if($("#infoParentEmail")) $("#infoParentEmail").value=el.parent_email||"";
    await populateClassSelect("infoClassId",currentTeacherId,false);
    if($("#infoClassId")) $("#infoClassId").value=el.class_id||"";
  }
  $("#modalFicheEleve").classList.add("show");
};
window.switchFicheTab=function(tab){
  $$(".template-tab[data-ftab]").forEach(t=>t.classList.toggle("active",t.dataset.ftab===tab));
  $$(".ftab").forEach(f=>f.style.display="none");
  const el=$("#ftab-"+tab); if(el) el.style.display="block";
  if(tab==="notes"&&currentFicheEleveId)        loadFicheNotes(currentFicheEleveId);
  if(tab==="comportement"&&currentFicheEleveId)  loadFicheIncidents(currentFicheEleveId);
  if(tab==="quiz"&&currentFicheEleveId)          loadFicheQuiz(currentFicheEleveId);
};
async function loadFicheNotes(eleveId){
  try{ const {data:notes,error}=await sb().from("grades").select("*,evaluations(title,max_score,subject,eval_date)").eq("student_id",eleveId).order("created_at",{ascending:false});
    if(error) throw error;
    const container=$("#ficheNotesList"); if(!container) return;
    if(!notes?.length){container.innerHTML='<p class="panel-empty">Aucune note.</p>';if($("#ficheMoyenne"))$("#ficheMoyenne").style.display="none";return;}
    container.innerHTML=notes.map(n=>{
      const titre=n.free_title||n.evaluations?.title||"Note libre";
      const matiere=n.free_subject||n.evaluations?.subject||"";
      const date=n.evaluations?.eval_date?new Date(n.evaluations.eval_date).toLocaleDateString('fr-FR'):"";
      const max=n.max_score||n.evaluations?.max_score||20;
      return `<div class="list-item">
        <div>
          <div style="font-weight:700">${titre}</div>
          <div style="font-size:13px;color:var(--text-muted)">${matiere}${date?" • "+date:""}</div>
          ${n.comment?`<div style="font-size:12px;color:var(--text-muted);font-style:italic">"${n.comment}"</div>`:""}
        </div>
        <div style="text-align:right">
          <div style="font-size:24px;font-weight:800;color:${n.score/max>=0.8?"#16a34a":n.score/max>=0.6?"#f97316":"#ef4444"}">${n.score}</div>
          <div style="font-size:11px;color:var(--text-muted)">/ ${max}</div>
          <button style="font-size:11px;background:none;border:none;color:#ef4444;cursor:pointer" onclick="deleteNote('${n.id}')">🗑</button>
        </div>
      </div>`;
    }).join('');
    const valid=notes.filter(n=>n.score!==null);
    if(valid.length>0){
      const moy=valid.reduce((s,n)=>s+(n.score/(n.max_score||n.evaluations?.max_score||20)*20),0)/valid.length;
      if($("#moyenneValue")) $("#moyenneValue").textContent=moy.toFixed(2)+" / 20";
      if($("#ficheMoyenne")) $("#ficheMoyenne").style.display="flex";
    }
  }catch(e){toast("Erreur",e.message,"error");}
}
window.openAddNote=async function(){
  const mL=$("#noteModeLinked"),mF=$("#noteModeFree"),sL=$("#noteSectionLinked"),sF=$("#noteSectionFree");
  if(mL) mL.onclick=()=>{ mL.classList.add("active");mF?.classList.remove("active");if(sL)sL.style.display="block";if(sF)sF.style.display="none"; };
  if(mF) mF.onclick=()=>{ mF.classList.add("active");mL?.classList.remove("active");if(sF)sF.style.display="block";if(sL)sL.style.display="none"; };
  mL?.classList.add("active");mF?.classList.remove("active");if(sL)sL.style.display="block";if(sF)sF.style.display="none";
  const {data}=await sb().from("evaluations").select("id,title,max_score,subject").eq("teacher_id",currentTeacherId).order("created_at",{ascending:false});
  const sel=$("#noteEvalId"); if(sel){
    sel.innerHTML='<option value="">-- Choisir --</option>'+(data||[]).map(e=>`<option value="${e.id}" data-max="${e.max_score||20}">${e.title}${e.subject?" ("+e.subject+")":""}</option>`).join('');
    sel.onchange=function(){ const o=sel.selectedOptions[0]; if(o?.dataset.max&&$("#noteMax")) $("#noteMax").value=o.dataset.max; };
  }
  if($("#addNoteForm")) $("#addNoteForm").style.display="block";
};
window.saveNote=async function(){
  const score=parseFloat($("#noteValue").value);
  if(isNaN(score)){toast("Erreur","Note invalide","error");return;}
  const max=parseFloat($("#noteMax").value)||20, comment=$("#noteComment")?.value.trim()||"";
  const isFree=$("#noteModeFree")?.classList.contains("active")??false;
  let payload={student_id:currentFicheEleveId,score,max_score:max,comment:comment||null,teacher_id:currentTeacherId};
  if(isFree){
    const ft=$("#noteFreeTitle")?.value.trim(),fs=$("#noteFreeSubject")?.value.trim();
    if(!ft){toast("Erreur","Titre requis en mode libre","error");return;}
    payload.free_title=ft; payload.free_subject=fs||null; payload.evaluation_id=null;
  } else {
    const evalId=$("#noteEvalId")?.value;
    if(!evalId){toast("Erreur","Sélectionne une évaluation","error");return;}
    payload.evaluation_id=evalId;
  }
  try{ const {error}=await sb().from("grades").insert(payload); if(error) throw error;
    if($("#addNoteForm")) $("#addNoteForm").style.display="none";
    if($("#noteValue"))   $("#noteValue").value="";
    if($("#noteComment")) $("#noteComment").value="";
    toast("Succès","Note ajoutée ✅","success"); await loadFicheNotes(currentFicheEleveId);
  }catch(e){toast("Erreur",e.message,"error");}
};
window.deleteNote=async function(id){
  if(!confirm("Supprimer ?")) return;
  try{ await sb().from("grades").delete().eq("id",id); await loadFicheNotes(currentFicheEleveId); toast("Supprimé","","success"); }
  catch(e){toast("Erreur",e.message,"error");}
};
window.openAddIncident=function(){ if($("#incidentDate")) $("#incidentDate").value=new Date().toISOString().split('T')[0]; if($("#addIncidentForm")) $("#addIncidentForm").style.display="block"; };
window.saveIncident=async function(){
  const type=$("#incidentType")?.value, date=$("#incidentDate")?.value, desc=$("#incidentDesc")?.value.trim();
  if(!desc){toast("Erreur","Description requise","error");return;}
  try{ await sb().from("incidents").insert({student_id:currentFicheEleveId,type,incident_date:date||new Date().toISOString().split('T')[0],description:desc,teacher_id:currentTeacherId});
    if($("#addIncidentForm")) $("#addIncidentForm").style.display="none"; if($("#incidentDesc")) $("#incidentDesc").value="";
    toast("Succès","✅","success"); await loadFicheIncidents(currentFicheEleveId);
  }catch(e){toast("Erreur",e.message,"error");}
};
async function loadFicheIncidents(eleveId){
  try{ const {data}=await sb().from("incidents").select("*").eq("student_id",eleveId).order("incident_date",{ascending:false});
    const container=$("#ficheIncidentsList"); if(!container) return;
    if(!data?.length){container.innerHTML='<p class="panel-empty">Aucun incident.</p>';return;}
    const icons={remarque_positive:"⭐",remarque_informative:"ℹ️",sanction:"⚠️"};
    container.innerHTML=data.map(i=>`<div class="list-item">
      <div>
        <div style="font-weight:700">${icons[i.type]||"📌"} ${(i.type||"").replace(/_/g," ")}</div>
        <div style="font-size:13px;color:var(--text-muted)">${i.incident_date?new Date(i.incident_date).toLocaleDateString("fr-FR"):""}</div>
        <div style="font-size:13px;margin-top:4px">${i.description}</div>
      </div>
      <button style="font-size:12px;background:none;border:none;color:#ef4444;cursor:pointer" onclick="deleteIncident('${i.id}')">🗑</button>
    </div>`).join('');
  }catch(e){}
}
window.deleteIncident=async function(id){
  if(!confirm("Supprimer ?")) return;
  try{ await sb().from("incidents").delete().eq("id",id); await loadFicheIncidents(currentFicheEleveId); }catch(e){}
};
async function loadFicheQuiz(eleveId){
  try{ const {data}=await sb().from("evaluations").select("id,title,subject,quiz_data,max_score").eq("teacher_id",currentTeacherId).eq("eval_type","quiz").order("created_at",{ascending:false});
    const container=$("#ficheQuizList"); if(!container) return;
    if(!data?.length){container.innerHTML='<p class="panel-empty">Aucun quiz créé.</p>';return;}
    container.innerHTML=data.map(q=>`<div class="list-item">
      <div><div style="font-weight:700">🧠 ${q.title}</div><div style="font-size:13px;color:var(--text-muted)">${q.subject||""} • ${q.quiz_data?.length||0} questions</div></div>
      <button class="btn" style="font-size:13px" onclick="startQuizForEleve('${q.id}','${q.title.replace(/'/g,"\\'")}')">▶ Lancer</button>
    </div>`).join('');
  }catch(e){}
}
let quizAnswers={};
window.startQuizForEleve=async function(evalId,title){
  const {data}=await sb().from("evaluations").select("quiz_data,max_score").eq("id",evalId).maybeSingle();
  if(!data?.quiz_data?.length){toast("Erreur","Ce quiz n'a pas de questions.","error");return;}
  currentFicheEvalId=evalId; quizAnswers={}; currentQuizEval=data;
  if($("#quizPlayTitle")) $("#quizPlayTitle").textContent="🧠 "+title;
  if($("#quizPlayBody")) $("#quizPlayBody").innerHTML=data.quiz_data.map((q,qi)=>`
    <div style="margin-bottom:20px;padding:14px;border:1px solid var(--border);border-radius:12px">
      <div style="font-weight:700;margin-bottom:10px">Q${qi+1}. ${q.question||""}</div>
      ${(q.options||[]).map((opt,oi)=>`<label style="display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;font-size:14px;border-radius:8px"
        onmouseover="this.style.background='var(--bg-main)'" onmouseout="this.style.background=''">
        <input type="radio" name="q${qi}" value="${oi}" onchange="quizAnswers[${qi}]=${oi}"> ${opt}
      </label>`).join('')}
    </div>`).join('');
  $("#modalFicheEleve").classList.remove("show");
  setTimeout(()=>$("#modalQuizPlay").classList.add("show"),200);
};
window.submitQuiz=async function(){
  if(!currentFicheEvalId||!currentQuizEval) return;
  const qs=currentQuizEval.quiz_data||[]; let correct=0;
  qs.forEach((q,i)=>{ if(quizAnswers[i]!==undefined&&Number(quizAnswers[i])===Number(q.correct)) correct++; });
  const score=Math.round((correct/qs.length)*(currentQuizEval.max_score||20)*10)/10;
  try{ await sb().from("grades").insert({student_id:currentFicheEleveId,evaluation_id:currentFicheEvalId,score,max_score:currentQuizEval.max_score||20,comment:`Quiz : ${correct}/${qs.length}`,teacher_id:currentTeacherId});
    $("#modalQuizPlay").classList.remove("show");
    toast("Quiz terminé !",`${correct}/${qs.length} → ${score}/${currentQuizEval.max_score||20}`,"success");
    setTimeout(()=>{ $("#modalFicheEleve").classList.add("show"); loadFicheNotes(currentFicheEleveId); },600);
  }catch(e){toast("Erreur",e.message,"error");}
};
window.saveEleveInfos=async function(){
  const fn=$("#infoFirstName")?.value.trim(), ln=$("#infoLastName")?.value.trim(),
    cid=$("#infoClassId")?.value, pe=$("#infoParentEmail")?.value.trim();
  if(!fn||!ln){toast("Erreur","Prénom et nom requis","error");return;}
  try{ await sb().from("students").update({first_name:fn,last_name:ln,class_id:cid||null,parent_email:pe||null}).eq("id",currentFicheEleveId);
    toast("Succès","✅","success"); if($("#ficheEleveName")) $("#ficheEleveName").textContent=fn+" "+ln;
    await loadElevesList(currentTeacherId);
  }catch(e){toast("Erreur",e.message,"error");}
};

// ============================================
// ÉVALUATIONS
// ============================================
let quizQuestions=[], evalCurrentAssignees="class";

async function loadEvaluations(tid){
  try{ const {data,error}=await sb().from("evaluations").select("*,classes(name)").eq("teacher_id",tid).order("created_at",{ascending:false});
    if(error) throw error;
    const container=$("#evalsList"); if(!container) return;
    if(!data?.length){container.innerHTML='<p class="panel-empty">Aucune évaluation.</p>';return;}
    container.innerHTML=data.map(e=>`<div class="list-item">
      <div>
        <div style="font-weight:700">${e.eval_type==="quiz"?"🧠":"📝"} ${e.title}</div>
        <div style="font-size:13px;color:var(--text-muted)">${e.subject||""} • ${e.classes?.name||""} ${e.eval_date?"• "+new Date(e.eval_date).toLocaleDateString("fr-FR"):""}</div>
        ${e.eval_type==="quiz"&&e.quiz_data?`<div style="font-size:12px;color:var(--text-muted)">${e.quiz_data.length} question(s)</div>`:""}
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="badge-blue">${e.eval_type||"standard"}</span>
        <button class="btn btn-secondary" style="font-size:13px" onclick="openEditEval('${e.id}')">✏️</button>
        <button class="btn" style="font-size:13px;background:#ef4444" onclick="confirmDeleteEval('${e.id}','${e.title.replace(/'/g,"\\'")}')">🗑</button>
      </div>
    </div>`).join('');
  }catch(e){toast("Erreur",e.message,"error");}
}
window.openEditEval=async function(id){
  const {data}=await sb().from("evaluations").select("*").eq("id",id).maybeSingle(); if(!data) return;
  await populateClassSelect("evalClassId",currentTeacherId,false);
  switchEvalTemplate(data.eval_type||"standard");
  if($("#modalEvalTitle")) $("#modalEvalTitle").textContent="Modifier l'évaluation";
  if($("#evalId"))       $("#evalId").value=id;
  if($("#evalTitle"))    $("#evalTitle").value=data.title||"";
  if($("#evalSubject"))  $("#evalSubject").value=data.subject||"";
  if($("#evalClassId"))  $("#evalClassId").value=data.class_id||"";
  if($("#evalDate"))     $("#evalDate").value=data.eval_date||"";
  if($("#evalMaxScore")) $("#evalMaxScore").value=data.max_score||20;
  if($("#evalExpiresAt")) $("#evalExpiresAt").value=data.expires_at?data.expires_at.split('T')[0]:"";
  if(data.eval_type==="quiz"&&data.quiz_data?.length){ quizQuestions=JSON.parse(JSON.stringify(data.quiz_data)); renderQuizBuilder(); }
  if(data.class_id) await loadCustomAssignees(data.class_id,data.assigned_to||[]);
  $("#modalEval").classList.add("show");
};
window.confirmDeleteEval=function(id,title){
  $("#confirmText").textContent=`Supprimer "${title}" ?`;
  $("#btnConfirmDelete").onclick=()=>deleteEval(id); $("#modalConfirm").classList.add("show");
};
async function deleteEval(id){
  try{ await sb().from("evaluations").delete().eq("id",id);
    $("#modalConfirm").classList.remove("show"); toast("Supprimé","✅","success"); await loadEvaluations(currentTeacherId);
  }catch(e){toast("Erreur",e.message,"error");}
}
window.switchEvalTemplate=function(type){
  $$(".template-tab[data-type]").forEach(t=>t.classList.toggle("active",t.dataset.type===type));
  if($("#quizSection")) $("#quizSection").style.display=type==="quiz"?"block":"none";
  if($("#evalType"))    $("#evalType").value=type;
  if(type==="quiz")     initQuizBuilder();
};
window.toggleAssignment=function(mode){
  evalCurrentAssignees=mode;
  $$("[data-assign]").forEach(b=>b.classList.toggle("active",b.dataset.assign===mode));
  if($("#customAssignees")) $("#customAssignees").style.display=mode==="custom"?"block":"none";
};
async function loadCustomAssignees(classId,selected=[]){
  const {data}=await sb().from("students").select("id,first_name,last_name").eq("class_id",classId).order("last_name");
  const container=$("#customAssignees"); if(!container) return;
  container.innerHTML=`<div style="font-size:13px;font-weight:600;margin-bottom:8px">Sélectionner les élèves :</div>`+
    (data||[]).map(e=>`<label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:14px;cursor:pointer">
      <input type="checkbox" value="${e.id}" ${selected.includes(e.id)?"checked":""} class="assign-check">
      ${e.first_name} ${e.last_name}
    </label>`).join('');
}
async function saveEvaluation(tid){
  const id=$("#evalId")?.value, title=$("#evalTitle")?.value.trim(), subject=$("#evalSubject")?.value.trim()||"",
    date=$("#evalDate")?.value, classId=$("#evalClassId")?.value, maxScore=parseFloat($("#evalMaxScore")?.value)||20,
    evalType=$("#evalType")?.value||"standard", expiresAt=$("#evalExpiresAt")?.value||null;
  if(!title){toast("Erreur","Titre requis","error");return;}
  if(!classId){toast("Erreur","Classe requise","error");return;}
  const quizData=evalType==="quiz"?collectQuizData():null;
  if(evalType==="quiz"&&quizData?.some(q=>!q.question.trim())){toast("Erreur","Tous les énoncés sont requis","error");return;}
  let assignedTo=null;
  if(evalCurrentAssignees==="custom") assignedTo=[...document.querySelectorAll(".assign-check:checked")].map(cb=>cb.value);
  try{
    const payload={title,subject,eval_date:date||new Date().toISOString().split("T")[0],class_id:classId,max_score:maxScore,teacher_id:tid,eval_type:evalType,expires_at:expiresAt||null,quiz_data:quizData,assigned_to:assignedTo};
    if(id){ await sb().from("evaluations").update(payload).eq("id",id); toast("Succès","Modifiée ✅","success"); }
    else   { await sb().from("evaluations").insert(payload); toast("Succès","Créée ✅","success"); }
    $("#modalEval").classList.remove("show"); await loadEvaluations(tid);
  }catch(e){toast("Erreur",e.message,"error");}
}
function initQuizBuilder(){ if(!quizQuestions.length) quizQuestions=[{question:"",options:["","","",""],correct:0}]; renderQuizBuilder(); }
function renderQuizBuilder(){
  const container=$("#quizBuilder"); if(!container) return;
  container.innerHTML="";
  quizQuestions.forEach((q,idx)=>{
    const block=document.createElement("div"); block.className="quiz-question-block";
    block.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="question-label">Question ${idx+1}</div>
        ${quizQuestions.length>1?`<button type="button" onclick="removeQuizQuestion(${idx})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:13px">🗑</button>`:""}
      </div>
      <input type="text" class="input" placeholder="Énoncé…" value="${(q.question||"").replace(/"/g,"&quot;")}"
        oninput="quizQuestions[${idx}].question=this.value" style="margin-bottom:10px">
      ${[0,1,2,3].map(i=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <input type="radio" name="correct-${idx}" value="${i}" ${Number(q.correct)===i?"checked":""} onchange="quizQuestions[${idx}].correct=${i}" title="Bonne réponse">
        <input type="text" class="input" placeholder="Option ${i+1}…" value="${((q.options&&q.options[i])||"").replace(/"/g,"&quot;")}"
          oninput="if(!quizQuestions[${idx}].options)quizQuestions[${idx}].options=[];quizQuestions[${idx}].options[${i}]=this.value">
      </div>`).join("")}
      <div style="font-size:11px;color:var(--text-muted)">☝️ Coche la radio = bonne réponse</div>`;
    container.appendChild(block);
  });
}
window.addQuizQuestion=function(){ quizQuestions.push({question:"",options:["","","",""],correct:0}); renderQuizBuilder(); document.querySelector("#quizBuilder .quiz-question-block:last-child")?.scrollIntoView({behavior:"smooth"}); };
window.removeQuizQuestion=function(idx){ quizQuestions.splice(idx,1); renderQuizBuilder(); };
function collectQuizData(){ return quizQuestions.map(q=>({question:q.question||"",options:(q.options||["","","",""]).map(o=>o||""),correct:Number(q.correct)||0})); }

// ============================================
// ACTIVITÉS
// ============================================
async function loadActivites(tid){
  try{ const {data,error}=await sb().from("activities").select("*,classes(name)").eq("teacher_id",tid).order("due_date",{ascending:false});
    if(error) throw error;
    const container=$("#activitesList"); if(!container) return;
    if(!data?.length){container.innerHTML='<p class="panel-empty">Aucune activité.</p>';return;}
    const sl={"assigned":"📤 Assignée","in_progress":"⏳ En cours","submitted":"✅ Rendue","late":"⚠️ En retard"};
    container.innerHTML=data.map(a=>`<div class="list-item">
      <div style="flex:1">
        <div style="font-weight:700">${getActIcon(a.activity_type)} ${a.title}</div>
        <div style="font-size:13px;color:var(--text-muted)">${a.classes?.name||""} ${a.due_date?"• Pour le "+new Date(a.due_date).toLocaleDateString("fr-FR"):""}</div>
        ${a.instructions?`<div style="font-size:12px;margin-top:3px;color:var(--text-muted)">${a.instructions.substring(0,80)}${a.instructions.length>80?"…":""}</div>`:""}
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="badge-blue">${sl[a.status||"assigned"]||a.status}</span>
        <button class="btn btn-secondary" style="font-size:13px" onclick="openEditActivite('${a.id}')">✏️</button>
        <button class="btn" style="font-size:13px;background:#ef4444" onclick="confirmDeleteActivite('${a.id}','${a.title.replace(/'/g,"\\'")}')">🗑</button>
      </div>
    </div>`).join('');
  }catch(e){toast("Erreur",e.message,"error");}
}
function getActIcon(type){ return {devoir:"📚",dm:"🏠",projet:"🔬",sortie:"🚌",cours:"📖",exercice:"✏️"}[type]||"📋"; }
window.openEditActivite=async function(id){
  const {data}=await sb().from("activities").select("*").eq("id",id).maybeSingle(); if(!data) return;
  await populateClassSelect("activiteClassId",currentTeacherId,false);
  document.getElementById("activiteId").value=id;
  document.getElementById("activiteTitle").value=data.title||"";
  document.getElementById("activiteDescription").value=data.description||"";
  document.getElementById("activiteInstructions").value=data.instructions||"";
  document.getElementById("activiteType").value=data.activity_type||"devoir";
  document.getElementById("activiteDueDate").value=data.due_date||"";
  document.getElementById("activiteStatus").value=data.status||"assigned";
  document.getElementById("activiteClassId").value=data.class_id||"";
  document.getElementById("modalActiviteTitle").textContent="Modifier l'activité";
  $("#modalActivite").classList.add("show");
};
window.confirmDeleteActivite=function(id,title){
  $("#confirmText").textContent=`Supprimer "${title}" ?`;
  $("#btnConfirmDelete").onclick=()=>deleteActivite(id); $("#modalConfirm").classList.add("show");
};
async function deleteActivite(id){
  try{ await sb().from("activities").delete().eq("id",id);
    $("#modalConfirm").classList.remove("show"); toast("Supprimé","✅","success"); await loadActivites(currentTeacherId);
  }catch(e){toast("Erreur",e.message,"error");}
}
async function saveActivite(tid){
  const id=document.getElementById("activiteId")?.value||"";
  const title=(document.getElementById("activiteTitle")?.value||"").trim();
  const desc=(document.getElementById("activiteDescription")?.value||"").trim();
  const instr=(document.getElementById("activiteInstructions")?.value||"").trim();
  const type=document.getElementById("activiteType")?.value||"devoir";
  const dueDate=document.getElementById("activiteDueDate")?.value||null;
  const status=document.getElementById("activiteStatus")?.value||"assigned";
  const classId=document.getElementById("activiteClassId")?.value||"";
  if(!title||!classId){toast("Erreur","Titre et classe requis","error");return;}
  const payload={title,description:desc,instructions:instr||null,activity_type:type,due_date:dueDate,class_id:classId,teacher_id:tid,status};
  try{
    if(id){ await sb().from("activities").update(payload).eq("id",id); toast("Succès","Modifiée ✅","success"); }
    else   { await sb().from("activities").insert(payload); toast("Succès","Créée ✅","success"); }
    $("#modalActivite").classList.remove("show"); await loadActivites(tid);
  }catch(e){toast("Erreur",e.message,"error");}
}

// ============================================
// HELPERS + MODALS
// ============================================
async function populateClassSelect(selectId,tid,withAll=false){
  try{ const {data}=await sb().from("classes").select("id,name").eq("teacher_id",tid).order("name");
    const sel=$("#"+selectId); if(!sel) return;
    sel.innerHTML=(withAll?"<option value=''>Toutes les classes</option>":"<option value=''>Sélectionner une classe</option>")+(data||[]).map(cl=>`<option value="${cl.id}">${cl.name}</option>`).join('');
  }catch(e){}
}
function setupConfirmModal(){
  ["btnCancelConfirm","btnCancelConfirm2"].forEach(id=>$("#"+id)?.addEventListener("click",()=>$("#modalConfirm").classList.remove("show")));
}
function setupModalListeners(tid){
  const openClass=()=>{ if($("#modalClassTitle")) $("#modalClassTitle").textContent="Créer une classe"; if($("#classId")) $("#classId").value=""; if($("#className")) $("#className").value=""; if($("#classYear")) $("#classYear").value="2025-2026"; $("#modalClass").classList.add("show"); };
  $("#btnAddClass")?.addEventListener("click",openClass);
  ["btnCancelClass","btnCancelClass2"].forEach(id=>$("#"+id)?.addEventListener("click",()=>$("#modalClass").classList.remove("show")));
  $("#btnSaveClass")?.addEventListener("click",()=>saveClass(tid));

  const openEleve=async()=>{ await populateClassSelect("eleveClassId",tid,false); if($("#eleveFirstName")) $("#eleveFirstName").value=""; if($("#eleveLastName")) $("#eleveLastName").value=""; $("#modalEleve").classList.add("show"); };
  $("#btnAddEleve")?.addEventListener("click",openEleve);
  ["btnCancelEleve","btnCancelEleve2"].forEach(id=>$("#"+id)?.addEventListener("click",()=>$("#modalEleve").classList.remove("show")));
  $("#btnSaveEleve")?.addEventListener("click",()=>saveEleve(tid));
  ["btnCloseFiche"].forEach(id=>$("#"+id)?.addEventListener("click",()=>$("#modalFicheEleve").classList.remove("show")));

  const openEval=async()=>{
    await populateClassSelect("evalClassId",tid,false);
    switchEvalTemplate("standard"); if($("#evalId")) $("#evalId").value="";
    if($("#modalEvalTitle")) $("#modalEvalTitle").textContent="Créer une évaluation";
    ["evalTitle","evalSubject","evalDate","evalExpiresAt"].forEach(i=>{const el=$("#"+i);if(el)el.value="";});
    if($("#evalMaxScore")) $("#evalMaxScore").value="20";
    evalCurrentAssignees="class"; toggleAssignment("class");
    if($("#customAssignees")) $("#customAssignees").innerHTML="";
    quizQuestions=[];
    $("#modalEval").classList.add("show");
  };
  $("#btnAddEval")?.addEventListener("click",openEval); $("#btnAddEvalDash")?.addEventListener("click",openEval);
  ["btnCancelEval","btnCancelEval2"].forEach(id=>$("#"+id)?.addEventListener("click",()=>$("#modalEval").classList.remove("show")));
  $("#btnSaveEval")?.addEventListener("click",()=>saveEvaluation(tid));
  $("#evalClassId")?.addEventListener("change",async function(){ if(evalCurrentAssignees==="custom"&&this.value) await loadCustomAssignees(this.value); });

  const openActivite=async()=>{
    await populateClassSelect("activiteClassId",tid,false);
    document.getElementById("activiteId").value="";
    document.getElementById("activiteTitle").value="";
    document.getElementById("activiteDescription").value="";
    document.getElementById("activiteInstructions").value="";
    if(document.getElementById("activiteStatus")) document.getElementById("activiteStatus").value="assigned";
    if(document.getElementById("modalActiviteTitle")) document.getElementById("modalActiviteTitle").textContent="Créer une activité";
    $("#modalActivite").classList.add("show");
  };
  $("#btnAddActivite")?.addEventListener("click",openActivite);
  ["btnCancelActivite","btnCancelActivite2"].forEach(id=>$("#"+id)?.addEventListener("click",()=>$("#modalActivite").classList.remove("show")));
  $("#btnSaveActivite")?.addEventListener("click",()=>saveActivite(tid));
}

// ============================================
// ADMIN
// ============================================

async function adminCreateUser(email, password, plan = "free") {
  const { data, error } = await sb().functions.invoke("admin-create-user", {
    body: { email, password, plan }
  });
  if (error) throw new Error(error.message || "Erreur Edge Function");
  return data;
}

async function adminUpdateUser(targetUserId, { status, role, full_name } = {}) {
  const { data, error } = await sb().functions.invoke("admin-update-user", {
    body: { targetUserId, status, role, full_name }
  });
  if (error) throw new Error(error.message || "Erreur");
  return data;
}

window.adminSwitchView = function(view) {
  $$(".nav-item").forEach(i => i.classList.toggle("active", i.dataset.view === view));
  $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
  const t = { dashboard:"Tableau de bord", users:"Utilisateurs", licences:"Licences & plans", stats:"Statistiques" };
  if ($("#pageTitle")) $("#pageTitle").textContent = t[view] || view;
  if (view === "users")    adminLoadUsers();
  if (view === "licences") adminLoadLicences();
  if (view === "stats")    adminLoadStatsDetail();
};

async function adminLoadStats() {
  try {
    const [{ data:pr },{ data:pa },{ data:ad },{ data:all },{ data:et }] = await Promise.all([
      sb().from("profiles").select("id").eq("role","teacher"),
      sb().from("profiles").select("id").eq("role","parent"),
      sb().from("profiles").select("id").eq("role","admin"),
      sb().from("profiles").select("id"),
      sb().from("students").select("id")
    ]);
    if ($("#a-stat-profs"))   $("#a-stat-profs").textContent   = pr?.length  || 0;
    if ($("#a-stat-parents")) $("#a-stat-parents").textContent = pa?.length  || 0;
    if ($("#a-stat-admins"))  $("#a-stat-admins").textContent  = ad?.length  || 0;
    if ($("#a-stat-eleves"))  $("#a-stat-eleves").textContent  = et?.length  || 0;
    if ($("#a-stat-total"))   $("#a-stat-total").textContent   = all?.length || 0;
  } catch(e) { console.error(e); }
}

async function adminLoadRecent() {
  try {
    const { data } = await sb().from("profiles").select("id,email,role,full_name,created_at")
      .order("created_at", { ascending: false }).limit(8);
    const container = $("#adminRecentList"); if (!container) return;
    container.innerHTML = data?.length ? renderUserList(data, false) : '<p class="panel-empty">Aucun utilisateur.</p>';
  } catch(e) {}
}

async function adminLoadUsers() {
  const q  = ($("#adminSearch")?.value  || "").trim().toLowerCase();
  const rf = ($("#adminRoleFilter")?.value || "");
  try {
    let query = sb().from("profiles").select("id,email,role,full_name,status,created_at").order("created_at",{ascending:false});
    if (rf) query = query.eq("role", rf);
    const { data, error } = await query; if (error) throw error;
    const filtered = (data || []).filter(u => !q || (u.email||"").toLowerCase().includes(q) || (u.full_name||"").toLowerCase().includes(q));
    const container = $("#adminUsersList"); if (!container) return;
    container.innerHTML = filtered.length ? renderUserList(filtered, true) : '<p class="panel-empty">Aucun résultat.</p>';
  } catch(e) { toast("Erreur", e.message, "error"); }
}
window.adminLoadUsers = adminLoadUsers;

function renderUserList(data, showEdit) {
  const rc = { admin:"#7c3aed", teacher:"#1d4ed8", parent:"#15803d", student:"#b45309" };
  const rl = { admin:"🛡️ Admin", teacher:"👩‍🏫 Prof", parent:"👨‍👩‍👧 Parent", student:"🎒 Élève" };
  const sb_map = {
    active:    "<span style='color:#22c55e;font-weight:700'>✅ Actif</span>",
    suspended: "<span style='color:#f59e0b;font-weight:700'>⏸ Suspendu</span>",
    blocked:   "<span style='color:#ef4444;font-weight:700'>🚫 Bloqué</span>",
  };
  return data.map(u => `<div class="list-item">
    <div style="flex:1">
      <div style="font-weight:700">${u.full_name || "(Sans nom)"}</div>
      <div style="font-size:13px;color:var(--text-muted)">${u.email||""} • ${u.created_at ? new Date(u.created_at).toLocaleDateString("fr-FR") : "-"}</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <span style="background:${rc[u.role]||"#6b7280"};color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700">${rl[u.role]||u.role}</span>
      ${sb_map[u.status||"active"] || sb_map.active}
      ${showEdit ? `<button class="btn btn-secondary" style="font-size:13px" onclick="openEditUser('${u.id}','${(u.full_name||"").replace(/'/g,"\\'")}','${u.email||""}','${u.role}','${u.status||"active"}')">✏️ Gérer</button>` : ""}
    </div>
  </div>`).join("");
}

window.openEditUser = function(id, name, email, role, status) {
  if ($("#editUserId"))     $("#editUserId").value     = id;
  if ($("#editUserName"))   $("#editUserName").value   = name;
  if ($("#editUserEmail"))  $("#editUserEmail").value  = email;
  if ($("#editUserRole"))   $("#editUserRole").value   = role;
  if ($("#editUserStatus")) $("#editUserStatus").value = status || "active";
  $("#modalEditUser").style.display = "flex";
};

async function adminLoadLicences() {
  try {
    const { data } = await sb().from("profiles").select("id,email,full_name,plan,plan_status").eq("role","teacher").order("email");
    const container = $("#adminLicencesList"); if (!container) return;
    container.innerHTML = (data||[]).length
      ? data.map(u => `<div class="list-item">
          <div><div style="font-weight:700">${u.full_name||u.email}</div><div style="font-size:13px;color:var(--text-muted)">${u.email}</div></div>
          <div style="display:flex;gap:8px;align-items:center">
            <select class="input" style="width:120px" onchange="adminUpdatePlan('${u.id}',this.value)">
              <option value="free"   ${(u.plan||"free")==="free"   ? "selected":""}>🆓 Free</option>
              <option value="pro"    ${u.plan==="pro"    ? "selected":""}>🚀 Pro</option>
              <option value="school" ${u.plan==="school" ? "selected":""}>🏫 School</option>
            </select>
            <span class="badge-blue">${u.plan_status||"trial"}</span>
          </div>
        </div>`).join("")
      : '<p class="panel-empty">Aucun professeur.</p>';
  } catch(e) {}
}
window.adminUpdatePlan = async function(uid, plan) {
  try { await sb().from("profiles").update({ plan }).eq("id", uid); toast("Plan mis à jour","✅","success"); }
  catch(e) { toast("Erreur", e.message, "error"); }
};

async function adminLoadStatsDetail() {
  try {
    const [{ data:pr },{ data:pa },{ data:ad },{ data:el },{ data:cl },{ data:ev },{ data:ac }] = await Promise.all([
      sb().from("profiles").select("id").eq("role","teacher"),
      sb().from("profiles").select("id").eq("role","parent"),
      sb().from("profiles").select("id").eq("role","admin"),
      sb().from("students").select("id"),
      sb().from("classes").select("id"),
      sb().from("evaluations").select("id"),
      sb().from("activities").select("id")
    ]);
    const container = $("#adminStatsDetail"); if (!container) return;
    container.innerHTML = `
      <div class="cards">
        <div class="card"><div class="card-icon card-icon-yellow">👩‍🏫</div><div class="card-content"><div class="card-value">${pr?.length||0}</div><div class="card-label">Professeurs</div></div></div>
        <div class="card"><div class="card-icon card-icon-blue">👨‍👩‍👧</div><div class="card-content"><div class="card-value">${pa?.length||0}</div><div class="card-label">Parents</div></div></div>
        <div class="card"><div class="card-icon card-icon-green">👥</div><div class="card-content"><div class="card-value">${el?.length||0}</div><div class="card-label">Élèves</div></div></div>
        <div class="card"><div class="card-icon card-icon-purple">🛡️</div><div class="card-content"><div class="card-value">${ad?.length||0}</div><div class="card-label">Admins</div></div></div>
      </div>
      <div class="cards" style="margin-top:16px">
        <div class="card"><div class="card-icon card-icon-yellow">📚</div><div class="card-content"><div class="card-value">${cl?.length||0}</div><div class="card-label">Classes</div></div></div>
        <div class="card"><div class="card-icon card-icon-blue">📝</div><div class="card-content"><div class="card-value">${ev?.length||0}</div><div class="card-label">Évaluations</div></div></div>
        <div class="card"><div class="card-icon card-icon-green">✏️</div><div class="card-content"><div class="card-value">${ac?.length||0}</div><div class="card-label">Activités</div></div></div>
      </div>`;
  } catch(e) {}
}

async function initAdmin() {
  bindHeader();
  const s = await sbSession();
  if (!s) { location.href = "index.html"; return; }
  const p = await sbProfile();
  if (!p || p.role !== "admin") {
    toast("Accès refusé", "Réservé à l'admin", "error");
    setTimeout(() => location.href = roleHome(p?.role || "teacher"), 700);
    return;
  }
  const who = $("#who"); if (who) who.textContent = p.full_name || p.email || "admin";

  $$(".nav-item[data-view]").forEach(link => {
    link.addEventListener("click", e => { e.preventDefault(); adminSwitchView(link.dataset.view); });
  });

  await adminLoadStats();
  await adminLoadRecent();

  $("#btnSaveEditUser")?.addEventListener("click", async () => {
    const id        = $("#editUserId").value;
    const role      = $("#editUserRole").value;
    const status    = $("#editUserStatus").value;
    const full_name = $("#editUserName").value.trim();
    try {
      await adminUpdateUser(id, { status, role, full_name });
      $("#modalEditUser").style.display = "none";
      toast("✅ Sauvegardé", "Modifications enregistrées.", "success");
      adminLoadUsers(); adminLoadStats();
    } catch(e) { toast("Erreur", e.message, "error"); }
  });

  $("#btnCancelEditUser")?.addEventListener("click",  () => { $("#modalEditUser").style.display = "none"; });
  $("#btnCancelEditUser2")?.addEventListener("click", () => { $("#modalEditUser").style.display = "none"; });

  $("#btnDeleteUser")?.addEventListener("click", () => {
    const id = $("#editUserId").value;
    $("#confirmText").textContent = "Supprimer cet utilisateur ? Cette action est irréversible.";
    $("#modalConfirm").style.display  = "flex";
    $("#modalEditUser").style.display = "none";
    $("#btnConfirmAction").onclick = async () => {
      try {
        await sb().functions.invoke("admin-update-user", { body: { targetUserId: id, delete: true } });
        $("#modalConfirm").style.display = "none";
        toast("🗑 Supprimé", "Utilisateur supprimé.", "success");
        adminLoadUsers(); adminLoadStats();
      } catch(e) { toast("Erreur", e.message, "error"); }
    };
  });

  $("#btnCancelConfirm")?.addEventListener("click",  () => { $("#modalConfirm").style.display = "none"; });
  $("#btnCancelConfirm2")?.addEventListener("click", () => { $("#modalConfirm").style.display = "none"; });
}
