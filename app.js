// ============================================
// Educatif MIKN — app.js v8
// Fix : boucle infinie student + role création + suppression user
// ============================================
const SUPABASE_URL = "https://itmvhjdblohqrgrbtaap.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0bXZoamRibG9ocXJncmJ0YWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMTMzOTcsImV4cCI6MjA4Njg4OTM5N30.Sx5e6YQwWtTiNR29-9kKfOorMKquj5dcIJN4VO4JSao";

const PLANS = {
  free: {
    maxClasses:2, maxStudents:20, maxEvals:10, maxActivites:5,
    maxQuizQ:5, quiz:true, salle:false, parents:false
  },
  pro: {
    maxClasses:15, maxStudents:200, maxEvals:999, maxActivites:999,
    maxQuizQ:999, quiz:true, salle:true, parents:true
  },
  school: {
    maxClasses:999, maxStudents:999, maxEvals:999, maxActivites:999,
    maxQuizQ:999, quiz:true, salle:true, parents:true
  }
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

// ✅ FIX 1 — null au lieu de "index.html" pour éviter la boucle infinie
function roleHome(r){ return {admin:"admin.html",teacher:"prof.html",parent:"parent.html"}[r]||null; }

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
  const s = await sbSession(); if(!s){ location.href="index.html"; return null; }
  const p = await sbProfile();

  // Si le profil n'existe pas encore (premier login après confirmation mail)
  if(!p && s?.user){
    await sb().from("profiles").upsert({
      id: s.user.id,
      email: s.user.email,
      full_name: s.user.user_metadata?.full_name || "",
      role: "teacher",
      plan: "free",
      status: "active"
    });
    location.reload(); // recharge pour récupérer le profil
    return null;
  }


  if(!p || p.role !== expected){
    toast("Accès refusé","Rôle requis : "+expected,"error");
    setTimeout(()=>{ const home=roleHome(p?.role); location.href=home||"index.html"; },700);
    return null;
  }

  // 🚫 BLOQUÉ — déconnexion totale, seul un admin peut débloquer
  if(p.status === "blocked"){
    await sb().auth.signOut();
    toast("Compte bloqué","Ton compte a été bloqué. Contacte l'administrateur.","error");
    setTimeout(()=>location.href="index.html", 2500);
    return null;
  }

  // ⏸ SUSPENDU — vérification de la durée
  if(p.status === "suspended"){
    const now = new Date();
    const until = p.suspended_until ? new Date(p.suspended_until) : null;

    if(until && now > until){
      // ✅ Suspension expirée → on réactive automatiquement en base
      await sb().from("profiles").update({ status:"active", suspended_until:null }).eq("id", p.id);
      p.status = "active";
      p.suspended_until = null;
      toast("Compte réactivé","Ta suspension est terminée, bienvenue !","success");
    } else {
      // Toujours suspendu → forcer le plan Free
      currentPlan = "free";
      currentPlanData = PLANS.free;
      const msg = until
        ? `Accès limité au plan Free jusqu'au ${until.toLocaleDateString("fr-FR")}.`
        : "Accès limité au plan Free. Contacte l'administrateur.";
      toast("Compte suspendu", msg, "error");
      // On laisse passer mais avec plan Free forcé
    }
  }

  // Suite normale si actif ou suspendu (plan Free forcé)
  if(p.status !== "suspended" || !p.suspended_until || new Date() > new Date(p.suspended_until)){
    const who=$("#who"); if(who) who.textContent=p.full_name||p.email||"";
    currentPlan = p.plan||"free";
    currentPlanData = PLANS[currentPlan]||PLANS.free;
  }

  const pb=$("#planBadge");
  if(pb){ pb.textContent=currentPlan.toUpperCase(); pb.className="plan-badge plan-"+currentPlan; }
  return p;
}

function bindHeader(){
  applyTheme();
  $("#themeBtn")?.addEventListener("click",toggleTheme);
  $("#logoutBtn")?.addEventListener("click",async()=>{ await sb().auth.signOut(); location.href="index.html"; });
}
function checkFeature(feat,cb){ if(currentPlanData[feat]) cb(); else showUpgradeModal(feat); }

function generatePin(len=4){
  return String(Math.floor(Math.random()*Math.pow(10,len))).padStart(len,'0');
}
function generateClassCode(name){
  const base=(name||"CLASSE").replace(/\s+/g,"").toUpperCase().substring(0,5);
  return base+String(Math.floor(Math.random()*100)).padStart(2,'0');
}

// PIN — toggle + regen + copy (appelés depuis prof.html)
window.togglePinDisplay=function(enabled){
  const s=document.getElementById("pinSection");
  if(s) s.style.display=enabled?"block":"none";
  if(enabled){
    const pin=document.getElementById("infoPinCode");
    if(pin&&!pin.value) pin.value=generatePin(4);
    refreshPinPreview();
  }
};
window.regenPin=function(){
  const pin=document.getElementById("infoPinCode");
  if(pin){ pin.value=generatePin(4); refreshPinPreview(); }
};
window.copyPin=function(){
  const pin=document.getElementById("infoPinCode")?.value||"";
  navigator.clipboard.writeText(pin).then(()=>toast("Copié","PIN copié ✅","success"));
};
function refreshPinPreview(){
  const pin=document.getElementById("infoPinCode")?.value||"—";
  const p=document.getElementById("displayPin"); if(p) p.textContent=pin;
}


function showUpgradeModal(feat, customMsg) {
  document.getElementById("modalUpgrade")?.remove();
  const msgs = {
    salle:   "Le Plan de salle interactif est disponible à partir du plan Pro.",
    parents: "L'espace parents est disponible à partir du plan Pro.",
    quota:   customMsg || "Tu as atteint la limite de ton plan Free.",
  };
  const modal = document.createElement("div");
  modal.className = "modal show"; modal.id = "modalUpgrade";
  modal.innerHTML = `<div class="modal-content" style="max-width:420px;text-align:center;padding:28px">
    <div style="font-size:48px;margin-bottom:8px">🔒</div>
    <h2 style="margin-bottom:8px">Limite atteinte</h2>
    <p style="color:var(--text-muted);font-size:14px;margin-bottom:20px">${msgs[feat]||msgs.quota}</p>
    <div style="background:linear-gradient(135deg,#fff7ed,#ffedd5);border:1.5px solid #fed7aa;border-radius:12px;padding:14px;margin-bottom:16px;font-size:13px;text-align:left;color:#9a3412">
      <strong style="display:block;margin-bottom:8px">⭐ Plan Pro — ce que tu débloques :</strong>
      ✅ Jusqu'à 15 classes<br>
      ✅ Jusqu'à 200 élèves<br>
      ✅ Évaluations & activités illimitées<br>
      ✅ Quiz sans limite de questions<br>
      ✅ Plan de salle interactif<br>
      ✅ Espace parents
    </div>
    <button class="btn" onclick="document.getElementById('modalUpgrade').remove();showPlanModal();"
      style="background:#f97316;width:100%;margin-bottom:8px">⭐ Voir les offres →</button>
    <button class="btn btn-secondary" onclick="document.getElementById('modalUpgrade').remove()"
      style="width:100%">Fermer</button>
  </div>`;
  document.body.appendChild(modal);
}
window.showPlanModal = function() {
  const icons = { free:"🆓", pro:"⭐", school:"🏫" };
  const names = { free:"Plan Free", pro:"Plan Pro", school:"Plan School" };
  const el = document.getElementById("planModalIcon");
  const nl = document.getElementById("planModalName");
  if (el) el.textContent = icons[currentPlan] || "🆓";
  if (nl) nl.textContent = names[currentPlan] || "Plan Free";
  // Encadre le plan actuel
  ["free","pro","school"].forEach(p => {
    const c = document.getElementById("card-"+p);
    if(c) c.style.outline = p === currentPlan ? "3px solid #f97316" : "none";
  });
  document.getElementById("modalPlan")?.classList.add("show");
};


// ============================================
// INDEX
// ============================================
function initIndex(){
  applyTheme();
  const tabs=$$("[data-role]");
  const setActive=r=>{ tabs.forEach(t=>{ t.classList.toggle("active",t.dataset.role===r); t.style.border=t.dataset.role===r?"2px solid var(--orange)":"2px solid var(--border)"; }); localStorage.setItem("mcv_role",r); };
  setActive(localStorage.getItem("mcv_role")||"teacher");
  tabs.forEach(t=>t.addEventListener("click",()=>setActive(t.dataset.role)));
  $("#themeBtn")?.addEventListener("click",toggleTheme);

  // ── Connexion ──
  $("#loginBtn")?.addEventListener("click",async()=>{
    const email=($("#email").value||"").trim(), pass=$("#password").value||"";
    if(!email||!pass){toast("Requis","Email et mot de passe obligatoires.","error");return;}
    if(!sbEnabled()){toast("Config","Supabase non configuré.","error");return;}
    try{
      const {error}=await sb().auth.signInWithPassword({email,password:pass});
      if(error) throw error;
      const p=await sbProfile();
      const home=roleHome(p?.role);
      if(home){ location.href=home; }
      else { await sb().auth.signOut(); toast("Accès refusé","Ce compte n'a pas d'espace disponible.","error"); }
    }catch(e){toast("Erreur",e?.message||String(e),"error");}
  });
  $("#forgotBtn")?.addEventListener("click",async()=>{
    const email=($("#email").value||"").trim(); if(!email){toast("Email requis","","error");return;}
    try{
      const {error}=await sb().auth.resetPasswordForEmail(email,{redirectTo:location.origin+"/reset.html"});
      if(error) throw error; toast("Email envoyé","Vérifie ta boîte mail.","success");
    }catch(e){toast("Erreur",e?.message||String(e),"error");}
  });

  // ── Inscription ──
  $("#registerBtn")?.addEventListener("click",async()=>{
    const fullName=($("#regFullName").value||"").trim();
    const email   =($("#regEmail").value||"").trim();
    const pass    = $("#regPassword").value||"";
    const pass2   = $("#regPasswordConfirm").value||"";
    if(!fullName)          { toast("Requis","Ton nom complet est obligatoire.","error"); return; }
    if(!email)             { toast("Requis","L'email est obligatoire.","error"); return; }
    if(pass.length < 8)    { toast("Mot de passe","Minimum 8 caractères.","error"); return; }
    if(pass !== pass2)     { toast("Erreur","Les mots de passe ne correspondent pas.","error"); return; }
    if(!sbEnabled())       { toast("Config","Supabase non configuré.","error"); return; }
    const btn=$("#registerBtn"); btn.disabled=true; btn.textContent="Création…";
    try{
      const {data,error}=await sb().auth.signUp({email,password:pass,options:{data:{full_name:fullName}}});
      if(error) throw error;
      // Créer le profil en base
      if(data?.user){
        await sb().from("profiles").upsert({
          id:data.user.id, email, full_name:fullName,
          role:"teacher", plan:"free", status:"active"
        });
      }
      toast("✅ Compte créé","Un email de confirmation t'a été envoyé. Vérifie ta boîte mail avant de te connecter.","success");
      // On vide le formulaire sans rediriger
      document.getElementById("regFullName").value = "";
      document.getElementById("regEmail").value    = "";
      document.getElementById("regPassword").value = "";
      document.getElementById("regPasswordConfirm").value = "";
      // Retour sur l'onglet connexion après 3s
      setTimeout(() => switchAuthTab("login"), 3000);

    }catch(e){
      toast("Erreur",e?.message||String(e),"error");
    }finally{
      btn.disabled=false; btn.textContent="Créer mon compte gratuit →";
    }
  });

  // ── Auto-redirect si déjà connecté ──
  (async()=>{
    if(!sbEnabled()) return;
    const s=await sbSession();
    if(s){
      const p=await sbProfile().catch(()=>null);
      const home=roleHome(p?.role);
      if(home){ location.href=home; }
      else { await sb().auth.signOut(); }
    }
  })();
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
  const banner=document.getElementById("freeBanner");
  if(banner) banner.style.display=currentPlan==="free"?"flex":"none";
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
  const cycleLabels={
    cycle1:"🌸 Maternelle", cycle2:"🔤 CP/CE1",
    cycle3:"📚 CE2/CM2",    college:"🏫 Collège+"
  };
  try{
    const {data,error}=await sb().from("classes")
      .select("id,name,school_year,cycle,class_code").eq("teacher_id",tid).order("name");
    if(error) throw error;
    const container=$("#classesList"); if(!container) return;
    if(!data?.length){container.innerHTML='<p class="panel-empty">Aucune classe créée.</p>';return;}
    container.innerHTML=data.map(cl=>`<div class="list-item">
      <div>
        <div style="font-weight:700">${cl.name}</div>
        <div style="font-size:13px;color:var(--text-muted);display:flex;gap:8px;flex-wrap:wrap;margin-top:3px">
          <span>${cl.school_year||'2025-2026'}</span>
          <span>${cycleLabels[cl.cycle]||'📚 CE2/CM2'}</span>
          ${cl.class_code?`<span style="font-family:monospace;background:var(--bg-main);padding:1px 8px;border-radius:4px;font-size:11px;border:1px solid var(--border)">🔑 ${cl.class_code}</span>`:''}
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" style="font-size:13px"
          onclick="openEditClass('${cl.id}','${cl.name.replace(/'/g,"\\'")}','${cl.school_year||''}','${cl.cycle||'cycle3'}','${cl.class_code||''}')">✏️</button>
        <button class="btn" style="font-size:13px;background:#ef4444"
          onclick="confirmDeleteClass('${cl.id}','${cl.name.replace(/'/g,"\\'")}')">🗑</button>
      </div>
    </div>`).join('');
  }catch(e){toast("Erreur",e.message,"error");}
}

window.openEditClass = function(id, name, year, cycle, classCode) {
  if($("#modalClassTitle")) $("#modalClassTitle").textContent = "Modifier la classe";
  if($("#classId"))          $("#classId").value   = id;
  if($("#className"))        $("#className").value = name;
  if($("#classYear"))        $("#classYear").value = year;
  if($("#classCycle"))       $("#classCycle").value = cycle || "cycle3";

  // Affiche le code classe
  const grp = $("#classCodeGroup");
  const inp = $("#classCodeDisplay");
  if(grp) grp.style.display = classCode ? "block" : "none";
  if(inp) inp.value = classCode || "";

  $("#modalClass").classList.add("show");
};

window.copyClassCode = function() {
  const code = $("#classCodeDisplay")?.value || "";
  if(!code) return;
  navigator.clipboard.writeText(code)
    .then(() => toast("Copié !", "Code classe copié 📋", "success"));
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
  const id=$("#classId").value;
  const name=$("#className").value.trim();
  const year=($("#classYear")?.value||"2025-2026").trim();
  const cycle=$("#classCycle")?.value||"cycle3";
  if(!name){toast("Erreur","Nom requis","error");return;}
  if(!id&&!(await checkQuota("classes",tid))) return;
  try{
    if(id){
      await sb().from("classes").update({name,school_year:year,cycle}).eq("id",id);
    } else {
      const class_code=generateClassCode(name);
      await sb().from("classes").insert({name,school_year:year,teacher_id:tid,tenant_id:tid,cycle,class_code});
    }
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
  try{
    let q=sb().from("students").select("*,classes(name)").eq("teacher_id",tid).order("last_name");
    if(fid) q=q.eq("class_id",fid);
    const {data,error}=await q; if(error) throw error;
    const container=$("#elevesList"); if(!container) return;
    if(!data?.length){container.innerHTML='<p class="panel-empty">Aucun élève.</p>';return;}
    container.innerHTML=data.map(e=>`<div class="list-item">
      <div>
        <div style="font-weight:700;display:flex;align-items:center;gap:6px">
          ${e.first_name} ${e.last_name}
          ${e.pin_enabled
            ?`<span onclick="revealPin('${e.id}','${e.first_name} ${e.last_name}')"
                style="font-size:11px;background:#dbeafe;color:#1e40af;padding:2px 8px;
                      border-radius:999px;font-weight:700;cursor:pointer;
                      transition:background .15s"
                title="Cliquer pour voir le PIN"
                onmouseover="this.style.background='#bfdbfe'"
                onmouseout="this.style.background='#dbeafe'">
                🔑 PIN actif 👁
              </span>`
            :''}
        </div>
        <div style="font-size:13px;color:var(--text-muted)">${e.classes?.name||'Non assigné'}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" style="font-size:13px"
          onclick="openFicheEleve('${e.id}','${(e.first_name+' '+e.last_name).replace(/'/g,"\\'")}','${(e.classes?.name||'').replace(/'/g,"\\'")}')">📋 Fiche</button>
        <button class="btn" style="font-size:13px;background:#ef4444"
          onclick="confirmDeleteEleve('${e.id}','${(e.first_name+' '+e.last_name).replace(/'/g,"\\'")}')">🗑</button>
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
  if(!(await checkQuota("students",tid))) return;
  try{
    await sb().from("students").insert({
      first_name:fn, last_name:ln, class_id:cid||null,
      teacher_id:tid, tenant_id:tid,
      pin_code:generatePin(4), pin_enabled:false
    });
    $("#modalEleve").classList.remove("show");
    $("#eleveFirstName").value=""; $("#eleveLastName").value="";
    toast("Succès","Élève ajouté ✅","success");
    await loadElevesList(tid); await loadDashboardStats(tid);
  }catch(e){toast("Erreur",e.message,"error");}
}

window.revealPin = async function(studentId, studentName) {
  try {
    const { data, error } = await sb()
      .from("students")
      .select("pin_code, classes(class_code)")
      .eq("id", studentId)
      .maybeSingle();
    if(error || !data) { toast("Erreur", "Impossible de charger le PIN", "error"); return; }

    document.getElementById("pinRevealModal")?.remove();
    const modal = document.createElement("div");
    modal.className = "modal show"; modal.id = "pinRevealModal";
    modal.innerHTML = `
      <div class="modal-content" style="max-width:340px;text-align:center">
        <div class="modal-header">
          <h2>🔑 PIN de l'élève</h2>
          <button class="modal-close" onclick="document.getElementById('pinRevealModal').remove()">✕</button>
        </div>
        <div class="modal-body" style="text-align:center;padding:20px">
          <div style="font-weight:700;font-size:15px;margin-bottom:16px">${studentName}</div>
          <div style="background:var(--bg-main);border-radius:12px;padding:16px 20px;margin-bottom:14px;border:1px solid var(--border)">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">CODE CLASSE</div>
            <div style="font-family:monospace;font-size:24px;font-weight:900;color:var(--orange);letter-spacing:4px">
              ${data.classes?.class_code || "—"}
            </div>
          </div>
          <div style="background:var(--bg-main);border-radius:12px;padding:16px 20px;border:1px solid var(--border)">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">CODE PIN</div>
            <div style="font-family:monospace;font-size:36px;font-weight:900;letter-spacing:8px;color:#1e40af">
              ${data.pin_code || "—"}
            </div>
          </div>
          <button class="btn btn-secondary" style="width:100%;margin-top:14px"
            onclick="navigator.clipboard.writeText('Classe: ${data.classes?.class_code||''} | PIN: ${data.pin_code||''}').then(()=>toast('Copié','✅','success'))">
            📋 Copier code + PIN
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  } catch(e) { toast("Erreur", e.message, "error"); }
};


// ============================================
// PLAN DE SALLE v7d — CANVAS LIBRE
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

function renderSalle(tid){
  const container=document.getElementById("planContainer");
  if(!container) return;
  const studentMap={};
  salleEleves.forEach(e=>{ studentMap[e.id]={ id:e.id, first:String(e.first_name||""), last:String(e.last_name||"") }; });
  const seatOccupied={};
  salleLayout.forEach(table=>{
    (table.seats||[]).forEach(seat=>{ if(seat.studentId) seatOccupied[table.id+"|"+seat.pos]=String(seat.studentId); });
  });
  const placedIds=new Set(Object.values(seatOccupied));
  const unplaced=salleEleves.filter(e=>!placedIds.has(String(e.id)));
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
      seatsGrid=`<div style="display:flex;align-items:center;justify-content:center;min-height:52px;border-radius:8px;padding:10px 16px;background:linear-gradient(135deg,#1e293b,#334155);color:#fff;font-size:13px;font-weight:700;letter-spacing:1px;gap:6px">🧑‍🏫 Professeur</div>`;
    } else {
      seatsGrid=`<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:5px">`;
      (table.seats||[]).forEach((seat,sIdx)=>{
        const key=table.id+"|"+seat.pos;
        const sid=seatOccupied[key]||null;
        const stu=sid?studentMap[sid]:null;
        if(stu){
          seatsGrid+=`<div draggable="true"
            ondragstart="event.stopPropagation();salleDragStudent='${stu.id}';event.dataTransfer.setData('text','student')"
            ondragover="event.preventDefault();event.stopPropagation()"
            ondrop="event.preventDefault();event.stopPropagation();salle_dropSeat(${tIdx},${sIdx},'${tid}')"
            onclick="event.stopPropagation();openFicheEleve('${stu.id}','${(stu.first+" "+stu.last).replace(/'/g,"\\'")}','')"
            style="position:relative;border-radius:7px;padding:5px 4px;cursor:grab;background:#2563eb;min-width:80px;min-height:54px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
            <span style="font-size:12px;font-weight:800;color:#FFFFFF;line-height:1.3;display:block;width:100%;text-align:center;word-break:break-word">${stu.first}</span>
            <span style="font-size:10px;color:#BFDBFE;line-height:1.2;display:block;width:100%;text-align:center;word-break:break-word">${stu.last}</span>
            <span onclick="event.stopPropagation();salle_unseat(${tIdx},${sIdx},'${tid}')" style="position:absolute;top:2px;right:3px;font-size:11px;color:#FCA5A5;cursor:pointer;line-height:1;font-weight:700">✕</span>
          </div>`;
        } else {
          seatsGrid+=`<div
            ondragover="event.preventDefault();event.stopPropagation()"
            ondrop="event.preventDefault();event.stopPropagation();salle_dropSeat(${tIdx},${sIdx},'${tid}')"
            onclick="event.stopPropagation();salle_pickStudent(${tIdx},${sIdx},'${tid}')"
            style="border-radius:7px;padding:5px;background:var(--bg-main);border:2px dashed var(--border);min-width:80px;min-height:54px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted);font-size:22px;opacity:.5">＋</div>`;
        }
      });
      seatsGrid+=`</div>`;
    }
    tablesHtml+=`<div style="position:absolute;left:${left};top:${top};background:var(--bg-card);border:2px solid var(--border);border-radius:12px;padding:8px 10px;cursor:move;z-index:10;box-shadow:0 3px 10px rgba(0,0,0,.15);min-width:${minW}px"
      draggable="true"
      ondragstart="event.stopPropagation();salleDragTable=${tIdx};salleTableDragOffsetX=event.offsetX;salleTableDragOffsetY=event.offsetY;event.dataTransfer.setData('text','table')"
      ondragover="event.preventDefault()"
      ondrop="event.preventDefault();event.stopPropagation()">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:4px">
        <span style="font-size:10px;font-weight:700;color:var(--text-muted);flex:1;cursor:pointer" title="Double-clic pour renommer"
          ondblclick="event.stopPropagation();salle_renameTable(${tIdx},'${tid}')">
          ${def.icon} ${table.label||def.label}
        </span>
        <span style="font-size:9px;opacity:.35;margin-right:2px" title="Double-clic sur le nom pour renommer">✏️</span>
        <button onclick="event.stopPropagation();salle_removeTable(${tIdx},'${tid}')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:11px;padding:0;line-height:1">✕</button>
      </div>
      ${seatsGrid}
    </div>`;
  });

  const toolbar=`<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
    <span style="font-weight:700;font-size:12px;color:var(--text-muted)">➕ Ajouter :</span>
    ${Object.entries(TABLE_TYPES).map(([type,def])=>`
      <button class="btn btn-secondary" style="font-size:11px;padding:5px 10px" onclick="salle_addTable('${type}','${tid}')">
        ${def.icon} ${def.label}
      </button>`).join("")}
    <div style="margin-left:auto;display:flex;gap:6px">
      <button class="btn" style="font-size:11px;padding:5px 10px;background:#ef4444" onclick="salle_clear('${tid}')">🗑 Vider</button>
      <button class="btn" style="font-size:11px;padding:5px 10px;background:#16a34a" onclick="salle_save()">💾 Enregistrer</button>
    </div>
  </div>`;
  const bandeau=`<div style="background:linear-gradient(135deg,#1e293b,#334155);color:#fff;text-align:center;padding:10px;border-radius:10px;margin-bottom:10px;font-size:12px;letter-spacing:2px;font-weight:600">🖥 TABLEAU / BUREAU DU PROFESSEUR</div>`;
  const canvas=`<div id="salleCanvas" style="position:relative;width:100%;min-height:560px;background:var(--bg-main);border:2px dashed var(--border);border-radius:14px;overflow:hidden"
    ondragover="event.preventDefault()" ondrop="salle_dropCanvas(event,'${tid}')">
    ${salleLayout.length===0?`<p style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--text-muted);font-size:14px;pointer-events:none;text-align:center;line-height:2">Ajoute des tables ci-dessus,<br>puis glisse-les où tu veux</p>`:""}
    ${tablesHtml}
  </div>`;
  const unplacedSection=unplaced.length>0?`<div style="margin-top:14px">
    <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--text-muted)">👥 Élèves non placés — glisse ou clique ＋</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${unplaced.map(e=>`<div class="seat-unplaced" draggable="true" ondragstart="salleDragStudent='${e.id}';event.dataTransfer.setData('text','student')">${e.first_name} ${e.last_name}</div>`).join("")}
    </div>
  </div>`:"";
  container.innerHTML=toolbar+bandeau+canvas+unplacedSection;
}

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
window.salle_clear=async function(tid){ if(!confirm("Vider toute la salle ?")) return; salleLayout=[]; await salle_save(); renderSalle(tid); };
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
window.salle_dropSeat=function(tIdx,sIdx,tid){
  const sid=salleDragStudent; if(!sid) return;
  salleDragStudent=null;
  salleLayout.forEach(t=>{ (t.seats||[]).forEach(s=>{ if(String(s.studentId)===String(sid)) s.studentId=null; }); });
  const seat=salleLayout[tIdx]?.seats?.[sIdx];
  if(seat) seat.studentId=sid;
  renderSalle(tid);
};
window.salle_unseat=function(tIdx,sIdx,tid){ const seat=salleLayout[tIdx]?.seats?.[sIdx]; if(seat) seat.studentId=null; renderSalle(tid); };
window.salle_pickStudent=function(tIdx,sIdx,tid){
  const placed=new Set();
  salleLayout.forEach(t=>(t.seats||[]).forEach(s=>{ if(s.studentId) placed.add(String(s.studentId)); }));
  const unplaced=salleEleves.filter(e=>!placed.has(String(e.id)));
  if(!unplaced.length){toast("Info","Tous les élèves sont déjà placés.");return;}
  document.getElementById("seatPickerModal")?.remove();
  const modal=document.createElement("div"); modal.className="modal show"; modal.id="seatPickerModal";
  modal.innerHTML=`<div class="modal-content" style="max-width:340px">
    <div class="modal-header"><h2>Placer un élève</h2>
      <button class="modal-close" onclick="document.getElementById('seatPickerModal').remove()">✕</button>
    </div>
    <div class="modal-body" style="max-height:300px;overflow-y:auto">
      ${unplaced.map(e=>`<div class="list-item" style="cursor:pointer" onclick="salle_placeFromPicker('${e.id}',${tIdx},${sIdx},'${tid}')">
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
window.salle_renameTable=function(tIdx,tid){
  const table=salleLayout[tIdx]; if(!table) return;
  document.getElementById("renameTableModal")?.remove();
  const modal=document.createElement("div"); modal.className="modal show"; modal.id="renameTableModal";
  modal.innerHTML=`<div class="modal-content" style="max-width:340px">
    <div class="modal-header">
      <h2>✏️ Renommer la table</h2>
      <button class="modal-close" onclick="document.getElementById('renameTableModal').remove()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Nom de la table</label>
        <input type="text" id="renameTableInput" class="input" value="${(table.label||"").replace(/"/g,"&quot;")}" placeholder="Ex : Groupe A"
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

window.openFicheEleve=async function(id,name,className){
  currentFicheEleveId = id;
  $("#ficheEleveId").value=id;
  $("#ficheEleveName").textContent=name;
  if($("#ficheEleveClass")) $("#ficheEleveClass").textContent=className||'';
  switchFicheTab('notes');
  await Promise.all([loadFicheNotes(id), loadFicheIncidents(id)]);

  // Charger infos + PIN
  const {data:stu}=await sb().from("students")
    .select("*,classes(id,name,class_code)").eq("id",id).maybeSingle();
  if(stu){
    if($("#infoFirstName"))   $("#infoFirstName").value=stu.first_name||'';
    if($("#infoLastName"))    $("#infoLastName").value=stu.last_name||'';
    if($("#infoParentEmail")) $("#infoParentEmail").value=stu.parent_email||'';
    await populateClassSelect("infoClassId",currentTeacherId,false);
    if($("#infoClassId")) $("#infoClassId").value=stu.class_id||'';
    // PIN
    const pinEnabled=stu.pin_enabled||false;
    if($("#infoPinEnabled")) $("#infoPinEnabled").checked=pinEnabled;
    if($("#infoPinCode"))    $("#infoPinCode").value=stu.pin_code||generatePin(4);
    togglePinDisplay(pinEnabled);
    // Preview code classe
    const cc=stu.classes?.class_code||'—';
    const dc=document.getElementById("displayClassCode"); if(dc) dc.textContent=cc;
    refreshPinPreview();
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
  const id=$("#ficheEleveId").value;
  const fn=$("#infoFirstName").value.trim();
  const ln=$("#infoLastName").value.trim();
  const cid=$("#infoClassId").value;
  const parentEmail=$("#infoParentEmail").value.trim();
  const pinEnabled=$("#infoPinEnabled")?.checked||false;
  const pinCode=$("#infoPinCode")?.value?.trim()||generatePin(4);
  if(!fn||!ln){toast("Erreur","Prénom et nom requis","error");return;}
  try{
    await sb().from("students").update({
      first_name:fn, last_name:ln, class_id:cid||null,
      parent_email:parentEmail||null,
      pin_enabled:pinEnabled, pin_code:pinCode
    }).eq("id",id);
    toast("Succès","Modifications enregistrées ✅","success");
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
  if(!id && !(await checkQuota("evals", tid))) return;
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
  if(!id && !(await checkQuota("activites", tid))) return;
  try{
    if(id){ await sb().from("activities").update(payload).eq("id",id); toast("Succès","Modifiée ✅","success"); }
    else   { await sb().from("activities").insert(payload); toast("Succès","Créée ✅","success"); }
    $("#modalActivite").classList.remove("show"); await loadActivites(tid);
  }catch(e){toast("Erreur",e.message,"error");}
}


async function checkQuota(type, tid) {
  const cfg = {
    classes:  { table:"classes",     col:"teacher_id", max:currentPlanData.maxClasses,   label:"classes" },
    students: { table:"students",    col:"teacher_id", max:currentPlanData.maxStudents,  label:"élèves" },
    evals:    { table:"evaluations", col:"teacher_id", max:currentPlanData.maxEvals,     label:"évaluations" },
    activites:{ table:"activities",  col:"teacher_id", max:currentPlanData.maxActivites, label:"activités" },
  };
  const c = cfg[type]; if (!c || c.max >= 999) return true;
  const { count } = await sb().from(c.table).select("id",{count:"exact",head:true}).eq(c.col,tid);
  if (count >= c.max) {
    showUpgradeModal("quota", `Tu as atteint la limite de ${c.max} ${c.label} sur le plan Free. Passe au plan Pro pour continuer.`);
    return false;
  }
  return true;
}

async function checkQuota(type,tid){
  const cfg={
    classes:  {table:"classes",    col:"teacher_id",max:currentPlanData.maxClasses,  label:"classes"},
    students: {table:"students",   col:"teacher_id",max:currentPlanData.maxStudents, label:"élèves"},
    evals:    {table:"evaluations",col:"teacher_id",max:currentPlanData.maxEvals,    label:"évaluations"},
    activites:{table:"activities", col:"teacher_id",max:currentPlanData.maxActivites,label:"activités"},
  };
  const c=cfg[type]; if(!c||c.max>=999) return true;
  const {count}=await sb().from(c.table).select("id",{count:"exact",head:true}).eq(c.col,tid);
  if(count>=c.max){
    showUpgradeModal("quota",`Tu as atteint la limite de ${c.max} ${c.label} sur le plan Free.`);
    return false;
  }
  return true;
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
  const openClass = () => {
    if($("#modalClassTitle")) $("#modalClassTitle").textContent = "Créer une classe";
    if($("#classId"))         $("#classId").value   = "";
    if($("#className"))       $("#className").value = "";
    if($("#classYear"))       $("#classYear").value = "2025-2026";
    if($("#classCycle"))      $("#classCycle").value = "cycle3";
    // ✅ Masquer le code classe (pas encore généré à la création)
    const grp = $("#classCodeGroup");
    if(grp) grp.style.display = "none";
    if($("#classCodeDisplay")) $("#classCodeDisplay").value = "";
    $("#modalClass").classList.add("show");
  };

  $("#btnAddClass")?.addEventListener("click",openClass);
  $("#btnAddClass2")?.addEventListener("click", openClass);
  ["btnCancelClass","btnCancelClass2"].forEach(id=>$("#"+id)?.addEventListener("click",()=>$("#modalClass").classList.remove("show")));
  $("#btnSaveClass")?.addEventListener("click",()=>saveClass(tid));

  const openEleve=async()=>{ await populateClassSelect("eleveClassId",tid,false); if($("#eleveFirstName")) $("#eleveFirstName").value=""; if($("#eleveLastName")) $("#eleveLastName").value=""; $("#modalEleve").classList.add("show"); };
  $("#btnAddEleve")?.addEventListener("click",openEleve);
  $("#btnAddEleve2")?.addEventListener("click", openEleve);
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

  // À binder dans setupModalListeners :
  $("#btnExportPins")?.addEventListener("click", exportPinsClasse);

  async function exportPinsClasse() {
    const classId = $("#filterClass")?.value;
    if(!classId) {
      toast("Sélectionne une classe", "Filtre d'abord par classe pour exporter ses PIN.", "error");
      return;
    }
    try {
      const [{ data: cls }, { data: students }] = await Promise.all([
        sb().from("classes").select("name, class_code").eq("id", classId).maybeSingle(),
        sb().from("students")
          .select("first_name, last_name, pin_code, pin_enabled")
          .eq("class_id", classId)
          .eq("pin_enabled", true)
          .order("last_name")
      ]);

      if(!students?.length) {
        toast("Aucun PIN actif", "Active d'abord les PIN des élèves de cette classe.", "error");
        return;
      }

      // Génère une page imprimable dans un nouvel onglet
      const rows = students.map(s => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-weight:600">
            ${s.first_name} ${s.last_name}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-family:monospace;
                    font-size:18px;font-weight:800;letter-spacing:4px;color:#f97316">
            ${cls?.class_code || "—"}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-family:monospace;
                    font-size:22px;font-weight:900;letter-spacing:6px;color:#1e40af">
            ${s.pin_code || "—"}
          </td>
        </tr>`).join("");

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Codes PIN — ${cls?.name || ""}</title>
        <style>
          body { font-family: sans-serif; padding: 30px; }
          h1   { font-size: 22px; margin-bottom: 4px; }
          p    { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; }
          th   { text-align:left; padding: 10px 14px; background: #f3f4f6;
                font-size: 12px; text-transform: uppercase; color: #6b7280; }
          @media print { button { display:none } }
        </style></head><body>
        <h1>🔑 Codes PIN — ${cls?.name || "Classe"}</h1>
        <p>Code classe : <strong style="font-family:monospace;font-size:16px;
          letter-spacing:3px;color:#f97316">${cls?.class_code || "—"}</strong>
          &nbsp;•&nbsp; Page de connexion : <strong>eleve-pin.html</strong>
        </p>
        <table>
          <thead><tr>
            <th>Élève</th><th>Code classe</th><th>PIN personnel</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <br>
        <button onclick="window.print()"
          style="padding:10px 20px;background:#f97316;color:#fff;border:none;
                border-radius:8px;font-size:14px;cursor:pointer">
          🖨️ Imprimer
        </button>
      </body></html>`;

      const w = window.open("", "_blank");
      w.document.write(html);
      w.document.close();

    } catch(e) { toast("Erreur", e.message, "error"); }
  }


}

// ============================================
// ADMIN — v9 (roles + plan profs/admins only)
// ============================================

async function adminCreateUser(email, password, plan = "free", role = "teacher", full_name = "") {
  const { data, error } = await sb().functions.invoke("admin-create-user", {
    body: { email, password, plan, role, full_name }
  });
  if (error) throw new Error(error.message || "Erreur Edge Function");
  return data;
}

async function adminUpdateUser(targetUserId, { status, role, full_name, plan, suspended_until } = {}) {
  const { data, error } = await sb().functions.invoke("admin-update-user", {
    body: { targetUserId, status, role, full_name, plan, suspended_until }
  });
  if (error) throw new Error(error.message || "Erreur");
  return data;
}


window.adminSwitchView = function(view) {
  $$(".nav-item").forEach(i => i.classList.toggle("active", i.dataset.view === view));
  $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
  const t = { dashboard:"Tableau de bord", users:"Utilisateurs", licences:"Licences & plans — Professeurs", stats:"Statistiques" };
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
    const { data } = await sb().from("profiles")
      .select("id,email,role,full_name,status,plan,created_at")
      .order("created_at", { ascending: false }).limit(8);
    const container = $("#adminRecentList"); if (!container) return;
    container.innerHTML = data?.length ? renderUserList(data, false) : '<p class="panel-empty">Aucun utilisateur.</p>';
  } catch(e) {}
}

async function adminLoadUsers() {
  const q  = ($("#adminSearch")?.value  || "").trim().toLowerCase();
  const rf = ($("#adminRoleFilter")?.value || "");
  try {
    let query = sb().from("profiles")
      .select("id,email,role,full_name,status,plan,created_at")
      .order("created_at", { ascending: false });
    if (rf) query = query.eq("role", rf);
    const { data, error } = await query; if (error) throw error;
    const filtered = (data || []).filter(u =>
      !q || (u.email||"").toLowerCase().includes(q) || (u.full_name||"").toLowerCase().includes(q)
    );
    const container = $("#adminUsersList"); if (!container) return;
    container.innerHTML = filtered.length ? renderUserList(filtered, true) : '<p class="panel-empty">Aucun résultat.</p>';
  } catch(e) { toast("Erreur", e.message, "error"); }
}
window.adminLoadUsers = adminLoadUsers;

function renderUserList(data, showEdit) {
  const rc = { admin:"#7c3aed", teacher:"#1d4ed8", parent:"#15803d", student:"#b45309" };
  const rl = { admin:"🛡️ Admin", teacher:"👩‍🏫 Prof", parent:"👨‍👩‍👧 Parent", student:"🎒 Élève" };
  const pl = { free:"🆓 Free", pro:"⭐ Pro", school:"🏫 School" };
  const hasPlanRole = r => r === "teacher" || r === "admin";
  const sb_map = {
    active:    "<span style='background:#dcfce7;color:#16a34a;font-weight:700;border-radius:999px;padding:3px 12px;font-size:12px'>✅ Actif</span>",
    suspended: "<span style='background:#fef9c3;color:#ca8a04;font-weight:700;border-radius:999px;padding:3px 12px;font-size:12px'>⏸ Suspendu</span>",
    blocked:   "<span style='background:#fee2e2;color:#dc2626;font-weight:700;border-radius:999px;padding:3px 12px;font-size:12px'>🚫 Bloqué</span>",
  };

  return data.map(u => `<div class="list-item">
    <div style="flex:1">
      <div style="font-weight:700">${u.full_name || "(Sans nom)"}</div>
      <div style="font-size:13px;color:var(--text-muted)">${u.email||""} • ${u.created_at ? new Date(u.created_at).toLocaleDateString("fr-FR") : "-"}</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span style="background:${rc[u.role]||"#6b7280"};color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700">${rl[u.role]||u.role}</span>
      ${hasPlanRole(u.role) ? `<span style="background:var(--bg-main);border:1px solid var(--border);border-radius:999px;padding:2px 10px;font-size:12px">${pl[u.plan||"free"]||u.plan}</span>` : ""}
      ${sb_map[u.status||"active"] || sb_map.active}
      ${showEdit ? `<button class="btn btn-secondary" style="font-size:13px"
        onclick="openEditUser('${u.id}','${(u.full_name||"").replace(/'/g,"\\'")}','${u.email||""}','${u.role}','${u.status||"active"}','${u.plan||"free"}')">✏️ Gérer</button>` : ""}
    </div>
  </div>`).join("");
}

window.openEditUser = function(id, name, email, role, status, plan) {
  if ($("#editUserId"))     $("#editUserId").value     = id;
  if ($("#editUserName"))   $("#editUserName").value   = name;
  if ($("#editUserEmail"))  $("#editUserEmail").value  = email;
  if ($("#editUserRole"))   $("#editUserRole").value   = role   || "teacher";
  if ($("#editUserStatus")) $("#editUserStatus").value = status || "active";
  if ($("#editUserPlan"))   $("#editUserPlan").value   = plan   || "free";
    // Réinitialise la date de suspension à l'ouverture
  if ($("#editSuspendedUntil")) $("#editSuspendedUntil").value = "";
  if ($("#suspendUntilGroup"))  $("#suspendUntilGroup").style.display = status === "suspended" ? "block" : "none";

  // Applique la visibilité du plan selon le rôle dès l'ouverture
  if (typeof togglePlanVisibility === "function") togglePlanVisibility("edit");
  $("#modalEditUser").style.display = "flex";
};

async function adminLoadLicences() {
  try {
    const { data } = await sb().from("profiles")
      .select("id,email,full_name,plan,plan_status,status")
      .eq("role","teacher").order("email");
    const container = $("#adminLicencesList"); if (!container) return;
    container.innerHTML = (data||[]).length
      ? data.map(u => `<div class="list-item">
          <div>
            <div style="font-weight:700">${u.full_name||"(Sans nom)"}</div>
            <div style="font-size:13px;color:var(--text-muted)">${u.email}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <select class="input" style="width:130px" onchange="adminUpdatePlan('${u.id}',this.value)">
              <option value="free"   ${(u.plan||"free")==="free"   ? "selected":""}>🆓 Free</option>
              <option value="pro"    ${u.plan==="pro"    ? "selected":""}>⭐ Pro</option>
              <option value="school" ${u.plan==="school" ? "selected":""}>🏫 School</option>
            </select>
            <span class="badge-blue">${u.plan_status||"trial"}</span>
            <span style="font-size:12px;font-weight:700;border-radius:999px;padding:3px 12px;
              background:${u.status==="active"?"#dcfce7":u.status==="suspended"?"#fef9c3":"#fee2e2"};
              color:${u.status==="active"?"#16a34a":u.status==="suspended"?"#ca8a04":"#dc2626"}">
              ${u.status==="active"?"✅ Actif":u.status==="suspended"?"⏸ Suspendu":"🚫 Bloqué"}
            </span>

          </div>
        </div>`).join("")
      : '<p class="panel-empty">Aucun professeur enregistré.</p>';
  } catch(e) {}
}
window.adminUpdatePlan = async function(uid, plan) {
  try {
    await sb().from("profiles").update({ plan }).eq("id", uid);
    toast("Plan mis à jour","✅","success");
  } catch(e) { toast("Erreur", e.message, "error"); }
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
    setTimeout(() => { const home = roleHome(p?.role); location.href = home || "index.html"; }, 700);
    return;
  }
  const who = $("#who"); if (who) who.textContent = p.full_name || p.email || "admin";

  $$(".nav-item[data-view]").forEach(link => {
    link.addEventListener("click", e => { e.preventDefault(); adminSwitchView(link.dataset.view); });
  });

  await adminLoadStats();
  await adminLoadRecent();

  $("#btnSaveEditUser")?.addEventListener("click", async () => {
  const id            = $("#editUserId").value;
  const role          = $("#editUserRole").value;
  const status        = $("#editUserStatus").value;
  const full_name     = $("#editUserName").value.trim();
  const hasPlan       = role === "teacher" || role === "admin";
  const plan          = hasPlan ? ($("#editUserPlan")?.value || "free") : "free";
  const suspended_until = status === "suspended"
    ? ($("#editSuspendedUntil")?.value || null)
    : null;
  if (!role) { toast("Rôle requis", "Sélectionne un rôle.", "error"); return; }
  try {
    await adminUpdateUser(id, { status, role, full_name, plan, suspended_until });
    $("#modalEditUser").style.display = "none";
    toast("✅ Sauvegardé", `Rôle : ${role}${hasPlan ? " • Plan : " + plan : ""}`, "success");
    adminLoadUsers();
    adminLoadStats();
  } catch(e) { toast("Erreur", e.message, "error"); }
});


  $("#btnCancelEditUser")?.addEventListener("click",  () => { $("#modalEditUser").style.display = "none"; });
  $("#btnCancelEditUser2")?.addEventListener("click", () => { $("#modalEditUser").style.display = "none"; });

  $("#btnDeleteUser")?.addEventListener("click", () => {
    const id   = $("#editUserId").value;
    const name = $("#editUserName").value || "cet utilisateur";
    $("#confirmText").textContent = `Supprimer "${name}" ? Cette action est irréversible.`;
    $("#modalConfirm").style.display  = "flex";
    $("#modalEditUser").style.display = "none";
    $("#btnConfirmAction").onclick = async () => {
      try {
        await sb().functions.invoke("admin-update-user", { body: { targetUserId: id, delete: true } });
        $("#modalConfirm").style.display = "none";
        toast("🗑 Supprimé", "Utilisateur supprimé.", "success");
        adminLoadUsers();
        adminLoadStats();
      } catch(e) { toast("Erreur", e.message, "error"); }
    };
  });

  $("#btnCancelConfirm")?.addEventListener("click",  () => { $("#modalConfirm").style.display = "none"; });
  $("#btnCancelConfirm2")?.addEventListener("click", () => { $("#modalConfirm").style.display = "none"; });
}
