const $=s=>document.querySelector(s),esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),wait=n=>new Promise(r=>setTimeout(r,n));
const DISC="https://claude.ai/artifact/AGuVUunMJLAsqv6tsVWgVA",TODAY="06 Oct 2026";
const C=["Computers & IT","Textile","Furniture","Electrical","Medical","Construction","Office Supplies","Manufacturing","Services","Other"];

// ─── Supabase auth service ────────────────────────────────────────────────────
function getSB() { return window.tbSupabase || null; }

function roleFromUser(user) {
  if (!user) return 'b';
  const meta = user.app_metadata || {};
  const userMeta = user.user_metadata || {};
  const raw = (meta.role || userMeta.role || 'b').toLowerCase();
  return raw === 'o' || raw === 'organization' || raw === 'org' ? 'o' : 'b';
}

function friendlyAuthError(err) {
  if (!err) return 'An unexpected error occurred.';
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid email or password'))
    return 'Incorrect email or password. Please try again.';
  if (msg.includes('email not confirmed'))
    return 'Please confirm your email address before signing in. Check your inbox.';
  if (msg.includes('user already registered') || msg.includes('already been registered'))
    return 'An account with this email already exists. Try logging in instead.';
  if (msg.includes('password should be at least') || msg.includes('weak password'))
    return 'Your password is too short. Use at least 8 characters.';
  if (msg.includes('rate limit') || msg.includes('too many requests'))
    return 'Too many attempts. Please wait a minute and try again.';
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Could not reach the server. Check your internet connection.';
  return err.message || 'Something went wrong. Please try again.';
}

const auth = {
  async signIn(email, password) {
    const sb = getSB();
    if (!sb) throw new Error('Supabase is not configured. Fill in assets/supabase.js.');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { role: roleFromUser(data.user), user: data.user };
  },
  async signUp(email, password, role) {
    const sb = getSB();
    if (!sb) throw new Error('Supabase is not configured. Fill in assets/supabase.js.');
    const { error } = await sb.auth.signUp({ email, password, options: { data: { role } } });
    if (error) throw error;
  },
  async reset(email) {
    const sb = getSB();
    if (!sb) throw new Error('Supabase is not configured. Fill in assets/supabase.js.');
    const redirectTo = location.origin + '/forgot-password.html#/reset-password';
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  },
  async updatePassword(newPassword) {
    const sb = getSB();
    if (!sb) throw new Error('Supabase is not configured.');
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },
  async signOut() {
    const sb = getSB();
    if (sb) await sb.auth.signOut();
    S.session = null;
  },
  async getToken() {
    const sb = getSB();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data?.session?.access_token || null;
  },
};

// ─── Profile persistence via Supabase user_metadata ──────────────────────────
//
// Storage choice: Supabase auth.users.user_metadata.
//   • Authenticated: only the signed-in user can read/write their own metadata.
//   • No database migration or new backend table required.
//   • Written via supabase.auth.updateUser({ data: { profile_b: {...}, profile_o: {...} } })
//   • Read back from user.user_metadata on getSession / onAuthStateChange.
//
// Stored keys inside user_metadata:
//   profile_b  – business profile fields (object matching SEC.b fields)
//   profile_o  – organization profile fields (object matching SEC.o fields)
//   onboarding_done_b – boolean, true once onboarding is completed for "b"
//   onboarding_done_o – boolean, true once onboarding is completed for "o"
//
const profileService = {
  // Save one role's profile data.  Returns the updated user object.
  async save(role, data) {
    const sb = getSB();
    if (!sb) throw new Error('Supabase is not configured.');
    const key = role === 'b' ? 'profile_b' : 'profile_o';
    const { data: updated, error } = await sb.auth.updateUser({
      data: { [key]: data },
    });
    if (error) throw error;
    return updated.user;
  },

  // Mark onboarding as complete for a role.
  async markOnboardingDone(role) {
    const sb = getSB();
    if (!sb) return;
    const key = role === 'b' ? 'onboarding_done_b' : 'onboarding_done_o';
    const { error } = await sb.auth.updateUser({ data: { [key]: true } });
    if (error) console.warn('[TenderBridge] Could not mark onboarding done:', error.message);
  },

  // Read profile data from a user object (from session or getUser).
  load(user, role) {
    if (!user?.user_metadata) return {};
    const key = role === 'b' ? 'profile_b' : 'profile_o';
    return user.user_metadata[key] || {};
  },

  // True if the user has completed onboarding for this role.
  isOnboardingDone(user, role) {
    if (!user?.user_metadata) return false;
    const key = role === 'b' ? 'onboarding_done_b' : 'onboarding_done_o';
    return !!user.user_metadata[key];
  },
};

// ─── Backend API helper ───────────────────────────────────────────────────────
// BASE_URL is picked up from a global set by each HTML page or defaults to
// http://localhost:4000.  Set window.TB_API_BASE in the HTML before the
// scripts to override per environment.
const API_BASE = (typeof window.TB_API_BASE === 'string'
  ? window.TB_API_BASE
  : 'http://localhost:4000'
).replace(/\/$/, '');

async function apiRequest(path, options = {}) {
  const token = await auth.getToken();
  if (!token) throw new Error('You must be signed in to perform this action.');
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = text; }
  if (!res.ok) {
    const msg = payload?.message || `Request failed (${res.status}).`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

// ─── API token bridge ─────────────────────────────────────────────────────────
(function wireApiTokenProvider() {
  if (typeof window.setApiTokenProvider === 'function') {
    window.setApiTokenProvider(() => auth.getToken());
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
const F=(l,k,t="text",req=1,o)=>({l,k,t,req,o});
const SEC={b:[["Basic information",[F("Business name","name"),F("Business type","type","select",1,["Proprietorship","Partnership","LLP","Private Limited","Public Limited"]),F("Registration number","reg"),F("GST number","gst"),F("MSME / Udyam number","msme","text",0)]],
["Contact information",[F("Email","email","email"),F("Phone","phone","tel"),F("Website","website","url",0),F("Address","address"),F("City","city"),F("State","state"),F("Pincode","pin")]],
["Products & services",[F("Products","products","textarea"),F("Services","services","textarea"),F("Annual turnover","turnover"),F("Years of experience","years","number"),F("Number of employees","emp","number"),F("Previous experience","prev","textarea",0)]],
["Categories & capabilities",[F("Categories","cats","chips"),F("Business capabilities","caps","textarea")]]],
o:[["Organization information",[F("Organization name","name"),F("Organization type","type","select",1,["Government department","Public sector undertaking","Private company","Educational institution","NGO"]),F("Description","description","textarea")]],
["Contact information",[F("Contact person","person"),F("Email","email","email"),F("Phone","phone","tel"),F("Website","website","url",0),F("Address","address"),F("City","city"),F("State","state"),F("Pincode","pin")]],
["Industry & categories",[F("Industry","industry","select",1,["Government & public administration","Healthcare","Education","Infrastructure","Manufacturing","Retail & logistics","IT & services"]),F("Categories you procure","cats","chips")]],
["Verification information",[F("Registration / CIN number","reg"),F("PAN","pan"),F("Authorised signatory","sign"),F("Official website or email domain","dom")]]]};

// S.session is set after a successful Supabase sign-in.
const S={role:"b",data:{b:{},o:{}},docs:{b:{cert:[],doc:[]},o:{doc:[]}},open:false,session:null};

const seedDocs=()=>{S.docs.b={cert:[],doc:[]};S.docs.o={doc:[]}};

const N=[{t:"New opportunity available",m:"Supply of Computer Systems and Accessories was posted in Computers & IT.",w:"2 hours ago",r:0},{t:"Profile incomplete",m:"Add your MSME certificate to reach 100% profile completion.",w:"Yesterday",r:0},{t:"Document reminder",m:"Your ISO 9001 certificate expires in 45 days.",w:"2 days ago",r:0},{t:"Verification update",m:"Your registration documents were received and are under review.",w:"4 days ago",r:1},{t:"System notification",m:"Scheduled maintenance on 12 Oct, 2:00–3:00 AM IST.",w:"1 week ago",r:1}];
const OPP=[["Supply of Computer Systems and Accessories","Tamil Nadu e-Governance Agency","18 Oct 2026"],["Office Furniture for New Administrative Block","Greater Chennai Corporation","12 Oct 2026"],["Network Switches and Structured Cabling","Orion Healthcare Pvt Ltd","20 Oct 2026"],["LED Street Lighting Components","TANGEDCO","16 Nov 2026"]];
const NAV={b:[["Overview","#/b/overview"],["Discover opportunities","#/b/discover"],["Business profile","#/b/profile"],["Profile setup","#/b/onb/1"],["Documents","#/b/documents"],["Certifications","#/b/certs"],["Notifications","#/b/notifications"],["Account","#/b/account"]],
o:[["Overview","#/o/overview"],["Discover opportunities","#/o/discover"],["Organization profile","#/o/profile"],["Profile setup","#/o/onb/1"],["Verification","#/o/verification"],["Documents","#/o/documents"],["Notifications","#/o/notifications"],["Account","#/o/account"]]};
const unread=()=>N.filter(n=>!n.r).length;
const toast=(m,t="")=>{const e=document.createElement("div");e.className="toast "+t;e.setAttribute("role","status");e.textContent=m;document.body.append(e);setTimeout(()=>e.remove(),3200)};

// ─── session helpers ──────────────────────────────────────────────────────────
function isSignedIn() { return !!S.session; }

// Load persisted profile from user_metadata into S.data for both roles.
function loadProfileFromUser(user) {
  if (!user) return;
  const bData = profileService.load(user, 'b');
  const oData = profileService.load(user, 'o');
  // Always seed email from auth record so it stays consistent.
  if (user.email) {
    bData.email = bData.email || user.email;
    oData.email = oData.email || user.email;
  }
  S.data.b = Object.keys(bData).length > 0 ? bData : {};
  S.data.o = Object.keys(oData).length > 0 ? oData : {};
}

function applySession(session, user) {
  S.session = session;
  S.role = roleFromUser(user);
  S.data = { b: {}, o: {} };
  seedDocs();
  loadProfileFromUser(user);
}

const PUBLIC_ROUTES = new Set(['', 'discover', 'login', 'signup', 'role', 'forgot',
  'signup/b', 'signup/o', 'reset-password']);

// ─── shells ───────────────────────────────────────────────────────────────────
const logo=h=>`<a class="logo" href="${h}"><span class="mark">TB</span>TenderBridge</a>`;
const pub=x=>`<header class="top pubnav">${logo("#/")}<div class="sp" style="flex:1"></div><a class="h btn" style="border:0" href="#cats">Categories</a><a class="btn" href="#/login">Log in</a><a class="btn p" href="#/role">Sign up</a></header>${x}<footer><div class="in"><div><b style="color:var(--navy)">TenderBridge</b><p class="mt" style="margin:4px 0 0">Procurement discovery for MSMEs and organizations.</p></div><div><a href="#/">About</a><a href="#/">Help</a><a href="#/">Privacy</a><a href="#/">Terms</a></div></div></footer>`;
const bell=()=>`<div class="bw"><button class="ib" data-a="bell" aria-label="Notifications, ${unread()} unread" aria-expanded="${S.open}">🔔${unread()?`<span class="dot">${unread()}</span>`:""}</button>${S.open?`<div class="dd" role="dialog" aria-label="Notifications">${N.slice(0,4).map(n=>`<div class="it"><b>${n.t}</b>${n.r?"":' <span class="bd">New</span>'}<div class="mt">${n.m}</div></div>`).join("")}<div class="it" style="border:0;text-align:center"><a href="#/${S.role}/notifications">View all notifications</a></div></div>`:""}</div>`;

function avatarLabel() {
  const email = S.session?.user?.email || '';
  return email ? email.slice(0, 2).toUpperCase() : (S.role === 'b' ? '?' : '?');
}

const shell=x=>{const r=S.role;return `<header class="top"><button class="ib menu" data-a="menu" aria-label="Open navigation">☰</button>${logo("#/"+r+"/overview")}<nav class="nav" id="nav" aria-label="${r==="b"?"Business":"Organization"} navigation">${NAV[r].map(([l,h,x])=>`<a href="${h}" ${x?'target="_blank" rel="noopener"':""} ${h===location.hash?'aria-current="page"':""}>${l}</a>`).join("")}</nav><div class="sp" style="flex:1"></div>${bell()}<a class="mark" style="border-radius:50%;width:36px;height:36px;text-decoration:none" href="#/${r}/account" aria-label="Account">${avatarLabel()}</a></header><main>${x}</main>`};
const head=(e,t,s,a="")=>`<div class="row" style="align-items:flex-end;margin-bottom:22px"><div><p class="eb">${e}</p><h1>${t}</h1><p class="mt" style="margin:8px 0 0">${s}</p></div>${a}</div>`;

// ─── forms ────────────────────────────────────────────────────────────────────
function fld(f,v,ed){if(!ed){const x=Array.isArray(v)?v.join(", "):v;return `<div class="kv ${f.t==="textarea"?"full":""}"><small>${f.l}</small><div>${esc(x)||'<span class="mt">Not provided</span>'}</div></div>`}
const id="f_"+f.k,rq=f.req?' <span class="rq" aria-hidden="true">*</span>':"";
if(f.t==="chips")return `<fieldset class="full"><legend>${f.l}${rq}</legend><div class="chips">${C.map(c=>`<label class="ch"><input type="checkbox" data-k="${f.k}" value="${c}" ${(v||[]).includes(c)?"checked":""}><span>${c}</span></label>`).join("")}</div><div class="err" id="e_${f.k}"></div></fieldset>`;
const i=f.t==="select"?`<select id="${id}" data-k="${f.k}"><option value="">Select…</option>${f.o.map(o=>`<option ${o===v?"selected":""}>${o}</option>`).join("")}</select>`:f.t==="textarea"?`<textarea id="${id}" data-k="${f.k}" rows="3">${esc(v)}</textarea>`:`<input id="${id}" data-k="${f.k}" type="${f.t}" value="${esc(v)}">`;
return `<div class="${f.t==="textarea"?"full":""}"><label for="${id}">${f.l}${rq}</label>${i}<div class="err" id="e_${f.k}"></div></div>`}
const collect=fs=>{const o={};fs.forEach(f=>{o[f.k]=f.t==="chips"?[...document.querySelectorAll(`[data-k=${f.k}]:checked`)].map(x=>x.value):$(`[data-k=${f.k}]`).value.trim()});return o};
function check(fs,o){let ok=true;fs.forEach(f=>{const v=o[f.k];let m="";if(f.req&&(!v||!v.length))m=f.t==="chips"?"Select at least one category.":"This field is required.";else if(v&&f.k==="email"&&!/^\S+@\S+\.\S+$/.test(v))m="Enter a valid email address.";else if(v&&f.t==="tel"&&v.replace(/\D/g,"").length<10)m="Enter a valid phone number.";else if(v&&f.k==="pin"&&!/^\d{6}$/.test(v))m="Pincode must be 6 digits.";const e=$("#e_"+f.k);if(e)e.textContent=m;const i=$("#f_"+f.k);if(i)i.setAttribute("aria-invalid",!!m);if(m)ok=false});if(!ok)toast("Please fix the highlighted fields.","bad");return ok}
const pct=r=>{const fs=SEC[r].flatMap(s=>s[1]).filter(f=>f.req),d=S.data[r];return Math.round((fs.filter(f=>d[f.k]&&d[f.k].length).length+(S.docs[r].doc.length?1:0))/(fs.length+1)*100)};
const prog=p=>`<div class="bar" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="Profile completion"><i style="width:${p}%"></i></div>`;
function docs(kind){const L=S.docs[S.role][kind],cert=kind==="cert",ty=cert?["ISO 9001","ISO 14001","BIS","Other certification"]:S.role==="b"?["Registration certificate","GST certificate","MSME certificate","Previous work document"]:["Registration certificate","Authorisation letter","PAN card","Verification document"];
return `<section class="panel"><div class="row"><div><h3>${cert?"Certifications":"Documents"}</h3><p class="mt" style="margin:2px 0 0">PDF, JPG or PNG, up to 5 MB each.</p></div><div class="up"><select id="dt_${kind}" aria-label="Document type">${ty.map(t=>`<option>${t}</option>`).join("")}</select><button class="btn p" data-a="pick" data-kind="${kind}">Upload file</button><input type="file" hidden id="fi_${kind}" data-up="${kind}" multiple accept=".pdf,.jpg,.jpeg,.png"></div></div>
${L.length?`<div class="tw"><table><thead><tr><th>File name</th><th>Type</th><th>Status</th><th>Uploaded</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${L.map((d,i)=>`<tr><td>${esc(d.n)}</td><td>${d.t}</td><td><span class="bd ${d.st==="Uploaded"?"ok":"wn"}">${d.st}</span></td><td>${d.dt}</td><td><button class="btn sm d" data-a="del" data-kind="${kind}" data-i="${i}" aria-label="Remove ${esc(d.n)}">Remove</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No files yet. Pick a document type and upload your first file.</div>`}</section>`}

// ─── onboarding ───────────────────────────────────────────────────────────────
const list=r=>[...SEC[r].map(s=>({t:s[0],f:s[1]})),...(r==="b"?[{t:"Certifications",d:"cert"}]:[]),{t:r==="b"?"Business documents":"Organization documents",d:"doc"},{t:"Review & complete profile",rv:1}];

function onb(r,n){
  S.role=r;
  const L=list(r),s=L[n-1];
  if(!s){location.hash=`#/${r}/onb/1`;return ""}
  let body=s.f
    ?`<section class="panel"><div class="fg" style="margin:0">${s.f.map(f=>fld(f,S.data[r][f.k],true)).join("")}</div></section>`
    :s.d?docs(s.d)
    :`<section class="panel"><h3>Completion: ${pct(r)}%</h3>${prog(pct(r))}</section>${SEC[r].map((x,i)=>`<section class="panel"><div class="row"><h3>${x[0]}</h3><a href="#/${r}/onb/${i+1}">Edit</a></div><div class="fg">${x[1].map(f=>fld(f,S.data[r][f.k],false)).join("")}</div></section>`).join("")}<section class="panel"><h3>Uploaded files</h3><p class="mt">${S.docs[r].doc.length+(S.docs[r].cert||[]).length} file(s) attached.</p></section>`;
  return `<header class="top">${logo("#/")}<div style="flex:1"></div><a class="btn" href="#/${r}/overview">Save and exit</a></header><main class="nar"><p class="eb">${r==="b"?"Business":"Organization"} onboarding · Step ${n} of ${L.length}</p><h1>${s.t}</h1><div class="steps" aria-hidden="true">${L.map((x,i)=>`<span class="${i+1<n?"done":i+1===n?"cur":""}"></span>`).join("")}</div><div id="onb-msg"></div><div style="margin-top:22px">${body}</div><div class="row"><button class="btn" data-a="back" data-n="${n}" data-r="${r}">Back</button><button class="btn p" data-a="next" data-n="${n}" data-r="${r}" id="onb-next">${s.rv?"Complete profile":"Save and continue"}</button></div></main>`
}

// ─── app pages ────────────────────────────────────────────────────────────────
let editing=false;

function profile(r){
  S.role=r;
  const d=S.data[r],p=pct(r);
  // Verification status for org: check if a verification request exists
  // (we track this with a flag in user_metadata set when one is submitted).
  const verStatus=S.session?.user?.user_metadata?.verification_submitted_o?'submitted':'none';
  const vs=r==="o"?(verStatus==="submitted"?`<span class="bd wn">Pending review</span>`:`<span class="bd bad">Not submitted</span>`):"";
  return shell(
    head(r==="b"?"Business":"Organization",
      r==="b"?"Business profile":"Organization profile",
      "Keep your details current so opportunities and verification stay accurate.",
      editing
        ?`<div class="up"><button class="btn" data-a="cancel">Cancel</button><button class="btn p" data-a="save" id="save-btn">Save changes</button></div>`
        :`<button class="btn p" data-a="edit">Edit profile</button>`
    )
    +`<div id="profile-banner"></div>`
    +`<section class="panel"><div class="row"><b>Profile completion</b><b>${p}%</b></div>${prog(p)}${r==="o"?`<p style="margin:12px 0 0">Verification status: ${vs} <a href="#/o/verification">View verification</a></p>`:""}</section>`
    +SEC[r].map(([t,fs])=>`<section class="panel"><h3>${t}</h3><div class="fg">${fs.map(f=>fld(f,d[f.k],editing)).join("")}</div></section>`).join("")
    +(r==="b"
      ?`<section class="panel"><h3>Certifications & documents</h3><p class="mt">${S.docs.b.cert.length} certification(s), ${S.docs.b.doc.length} document(s). <a href="#/b/certs">Certifications</a> · <a href="#/b/documents">Documents</a></p></section>`
      :`<section class="panel"><h3>Verification documents</h3><p class="mt">${S.docs.o.doc.length} document(s) on file. <a href="#/o/verification">Manage verification</a></p></section>`)
  );
}

function dash(r){
  S.role=r;
  const d=S.data[r],p=pct(r),L=OPP.map(o=>`<div class="li"><div><b>${o[0]}</b><div class="mt">${o[1]}</div></div><span class="mt" style="white-space:nowrap">${o[2]}</span></div>`);
  const qa=r==="b"
    ?`<a class="btn p" href="#/${S.role}/discover">Discover opportunities</a><a class="btn" href="#/b/onb/1">Set up profile</a><a class="btn" href="#/b/documents">Upload document</a><a class="btn" href="#/b/profile">Update profile</a>`
    :`<a class="btn p" href="#/${S.role}/discover">Discover opportunities</a><a class="btn" href="#/o/onb/1">Set up profile</a><a class="btn" href="#/o/verification">Verification</a><a class="btn" href="#/o/profile">Update profile</a>`;
  const top=`<section class="panel"><small class="mt">Profile completion</small><div class="big">${p}%</div>${prog(p)}</section>`;
  const displayName = esc(d.name || d.person || 'there');
  return shell(head(r==="b"?"Business workspace":"Organization workspace","Overview",`Welcome back, ${displayName}.`)
    +(r==="b"
      ?`<div class="g4">${top}<section class="panel"><small class="mt">New opportunities</small><div class="big">12</div><span class="mt">Added this week</span></section><section class="panel"><small class="mt">Closing soon</small><div class="big">3</div><span class="mt">Within 7 days</span></section><section class="panel"><small class="mt">Recommended categories</small><div class="chips" style="margin-top:10px">${(d.cats||["Add categories"]).map(c=>`<span class="bd">${c}</span>`).join("")}</div></section></div><div class="g2"><section class="panel"><h3>Recent discovery activity</h3>${["Viewed Network Switches and Structured Cabling","Searched \u201ccomputer\u201d in Chennai","Filtered by Electrical, Government"].map((a,i)=>`<div class="li"><span>${a}</span><span class="mt">${["Today","Yesterday","3 days ago"][i]}</span></div>`).join("")}</section><section class="panel"><h3>Closing soon</h3>${L.slice(0,3).join("")}</section></div>`
      :`<div class="g4">${top}<section class="panel"><small class="mt">Verification status</small><div style="margin:12px 0 4px"><span class="bd wn">Pending review</span></div><a href="#/o/verification">Review status</a></section><section class="panel" style="grid-column:span 2"><small class="mt">Organization information</small><div class="g2" style="margin-top:10px;gap:8px"><div class="kv"><small>Type</small><div>${esc(d.type)||"—"}</div></div><div class="kv"><small>Location</small><div>${esc(d.city)||"—"}</div></div><div class="kv"><small>Contact</small><div>${esc(d.person)||"—"}</div></div><div class="kv"><small>Email</small><div>${esc(d.email)||"—"}</div></div></div></section></div><section class="panel"><h3>Recently available opportunities</h3>${L.join("")}</section>`)
    +`<section class="panel"><h3>Quick actions</h3><div class="up" style="margin-top:12px">${qa}</div></section>`);
}

// ─── Organization Verification page ──────────────────────────────────────────
// Wires to the existing Node backend:
//   POST /api/v1/verification-requests
//   Body: { type, organizationName, contactPerson, email, contactPhone,
//           registrationNo, documents: [] }
//
// BLOCKER: The Node backend reads `app_metadata.role` from the JWT to
// authorize this endpoint (role must be "ORGANIZATION").  At sign-up we write
// role to `user_metadata` only.  Until a Supabase database trigger copies
// user_metadata.role → app_metadata.role, this endpoint returns 403.
//
// The verification form is fully implemented and submits correctly.
// Submission will succeed once the app_metadata trigger is in place.
// See BLOCKERS section in the implementation report.
function verify(){
  S.role="o";
  const d=S.data.o;
  const alreadySubmitted=!!S.session?.user?.user_metadata?.verification_submitted_o;
  const items=[["Registration number",d.reg],["PAN",d.pan],["Authorised signatory",d.sign],["Official website or email domain",d.dom]];
  const checklist=`<section class="panel"><h3>Verification checklist</h3>${items.map(([l,v])=>`<div class="li"><span>${l}${v?` <span class="mt">· ${esc(v)}</span>`:""}</span><span class="bd ${v?"ok":"bad"}">${v?"Provided":"Missing"}</span></div>`).join("")}<div class="li"><span>Verification documents</span><span class="bd ${S.docs.o.doc.length?"ok":"bad"}">${S.docs.o.doc.length?S.docs.o.doc.length+" uploaded":"Missing"}</span></div><p class="mt" style="margin:14px 0 0">Approval is handled by the admin team. You will get a notification when the status changes.</p></section>`;
  const form=alreadySubmitted
    ?`<section class="panel"><div class="bd wn" style="display:inline-flex;margin-bottom:12px">Verification request submitted</div><p class="mt">Your verification request has been submitted and is awaiting review. You will be notified when the status changes.</p><button class="btn" data-a="resubmit-verify">Submit another request</button></section>`
    :`<section class="panel"><h3>Submit verification request</h3><p class="mt" style="margin:0 0 14px">Submit your organization details for admin review. Required fields are marked with *.</p><div id="verify-banner"></div><form data-form="verify-org" class="fg" novalidate>
<div><label for="vf_name">Organization name <span class="rq">*</span></label><input id="vf_name" name="organizationName" required value="${esc(d.name||"")}"><div class="err" id="e_vf_name"></div></div>
<div><label for="vf_person">Contact person <span class="rq">*</span></label><input id="vf_person" name="contactPerson" required value="${esc(d.person||"")}"><div class="err" id="e_vf_person"></div></div>
<div><label for="vf_email">Email <span class="rq">*</span></label><input id="vf_email" name="email" type="email" required value="${esc(d.email||"")}"><div class="err" id="e_vf_email"></div></div>
<div><label for="vf_phone">Phone</label><input id="vf_phone" name="contactPhone" value="${esc(d.phone||"")}"></div>
<div><label for="vf_reg">Registration / CIN number</label><input id="vf_reg" name="registrationNo" value="${esc(d.reg||"")}"></div>
<div class="full"><p class="mt" style="margin:0 0 4px;font-size:12px">Document uploads are not available yet. The form will submit with document metadata only.</p></div>
<div class="full up"><button class="btn p" id="verify-btn">Submit verification request</button></div>
</form></section>`;
  return shell(
    head("Organization","Verification","Verified organizations earn a badge that vendors can trust.",
      `<span class="bd wn" style="font-size:14px;padding:6px 14px">${alreadySubmitted?"Pending review":"Not submitted"}</span>`)
    +checklist+form+docs("doc")
  );
}

function notes(r){S.role=r;return shell(head("Notifications","Notifications",`${unread()} unread`,`<button class="btn" data-a="markall">Mark all as read</button>`)+`<section class="panel">${N.map(n=>`<div class="nt ${n.r?"r":""}"><i aria-hidden="true"></i><div><b>${n.t}</b>${n.r?"":' <span class="bd">New</span>'}<div>${n.m}</div><small class="mt">${n.w}</small></div></div>`).join("")}</section>`)}
function acct(r){S.role=r;const d=S.data[r];const email=S.session?.user?.email||d.email||"";
return shell(head("Account","Account settings","Manage your sign-in details.")+`<form data-form="acct" novalidate><section class="panel nar" style="max-width:none"><h3>Account details</h3><div class="fg"><div><label for="a_n">Full name</label><input id="a_n" value="${esc(r==="b"?d.name||"":d.person||"")}"></div><div><label for="a_e">Email</label><input id="a_e" type="email" value="${esc(email)}" readonly aria-readonly="true"></div></div></section><section class="panel"><h3>Change password</h3><div class="fg"><div><label for="p1">New password</label><input id="p1" type="password" autocomplete="new-password"></div><div><label for="p2">Confirm password</label><input id="p2" type="password" autocomplete="new-password"><div class="err" id="e_p"></div></div></div></section><div class="up"><button class="btn p">Save changes</button><button type="button" class="btn d" data-a="signout">Log out</button></div></form>`)}

// ─── public pages ─────────────────────────────────────────────────────────────
const cardPrev=`<div class="panel" style="margin:0"><div class="chips"><span class="bd">Government</span><span class="bd" style="background:#fff;border:1px solid var(--line);color:var(--navy)">Tender</span></div><h3 style="margin:12px 0 4px">Supply of Computer Systems and Accessories</h3><p class="mt" style="margin:0 0 14px;font-size:14px">Tamil Nadu e-Governance Agency</p><div class="g2" style="gap:10px"><div class="kv"><small>Location</small><div>Chennai, Tamil Nadu</div></div><div class="kv"><small>Estimated value</small><div>₹25,00,000</div></div><div class="kv"><small>Category</small><div>Computers &amp; IT</div></div><div class="kv"><small>Deadline</small><div>18 Oct 2026</div></div></div></div>`;
const landing=()=>pub(`<div style="max-width:1180px;margin:0 auto;padding:0 24px"><section class="hero"><div><p class="eb">Procurement for MSMEs and organizations</p><h1>Find procurement opportunities that fit your business</h1><p>One place to discover government tenders and verified private requests, with profiles that buyers can trust.</p><div class="up" style="margin-top:24px"><a class="btn p" href="#/discover" style="height:46px">Discover Opportunities</a><a class="btn" href="#/role" style="height:46px">Sign Up</a></div></div>${cardPrev}</section>
<section class="sec" style="padding-top:8px"><h2>Government and private procurement, together</h2><div class="g2" style="margin-top:16px"><div class="panel"><h3>Government</h3><p class="mt">Tenders and RFQs from ministries, departments and public sector undertakings.</p></div><div class="panel"><h3>Private</h3><p class="mt">RFPs, vendor requests and supplier procurement from verified organizations.</p></div></div></section>
<section class="sec" id="cats"><h2>Browse by category</h2><div class="chips" style="margin-top:16px">${C.map(c=>`<span class="bd" style="font-size:14px;padding:6px 14px">${c}</span>`).join("")}</div></section>
<section class="sec"><h2>How TenderBridge works</h2><div class="g3" style="margin-top:16px">${[["Create your profile","Add business or organization details, categories and documents."],["Discover opportunities","Search and filter by type, category, location, value and deadline."],["Review and respond","Open an opportunity and prepare your response."]].map((s,i)=>`<div class="panel"><b class="mt">${i+1}</b><h3>${s[0]}</h3><p class="mt" style="margin:6px 0 0">${s[1]}</p></div>`).join("")}</div></section>
<section class="sec"><div class="g2"><div class="panel"><h3>For businesses</h3><ul class="ul"><li>See relevant opportunities in one feed</li><li>Reuse one profile and document set</li><li>Get closing-soon and document reminders</li></ul></div><div class="panel"><h3>For organizations</h3><ul class="ul"><li>Reach qualified MSMEs and vendors</li><li>Show a verified organization badge</li><li>Maintain a single trusted profile</li></ul></div></div></section>
<section class="sec"><div class="panel"><h2>Built on verification</h2><p class="mt" style="max-width:640px">Organizations submit registration details and documents for review before they are marked verified, so businesses know who they are dealing with.</p></div></section>
<section class="sec"><div class="cta"><h2>Ready to find your next opportunity?</h2><p style="margin:0 0 8px;opacity:.85">Create a free profile in a few minutes.</p><a class="btn" href="#/role">Sign Up</a><a class="btn" href="#/discover">Discover Opportunities</a></div></section></div>`);
const role=()=>pub(`<main class="nar"><h1>How will you use TenderBridge?</h1><p class="mt">Choose your role. You can't change it later without contacting support.</p><div class="g2" style="margin-top:20px">${[["b","Business","Find opportunities and respond as a supplier, MSME or vendor."],["o","Organization","Publish procurement needs and get verified as a buyer."]].map(([k,t,x])=>`<a class="panel" style="text-decoration:none;color:inherit;display:block" href="#/signup/${k}"><h3>${t}</h3><p class="mt">${x}</p><span class="btn p">Continue as ${t.toLowerCase()}</span></a>`).join("")}</div></main>`);
const authCard=(t,s,b)=>pub(`<main><div class="auth panel"><h1 style="font-size:26px">${t}</h1><p class="mt">${s}</p>${b}</div></main>`);
const pwf=(id,l,ac)=>`<div><label for="${id}">${l}</label><div class="pw"><input id="${id}" type="password" autocomplete="${ac}" required><button type="button" data-a="pw" data-t="${id}" aria-label="Show password">Show</button></div><div class="err" id="e_${id}"></div></div>`;
const authBanner=(msg)=>msg?`<div class="auth-banner" role="alert">${esc(msg)}</div>`:"";
const infoBanner=(msg)=>`<div class="auth-banner" style="background:#eaf1f7;color:#12304A;border-color:#c2d9ee" role="status">${esc(msg)}</div>`;

const resetPassword=()=>authCard(
  "Set new password","Choose a new password for your TenderBridge account.",
  `<form data-form="reset-password" class="fg" style="grid-template-columns:1fr" novalidate>`+
  `<div id="auth-banner-reset"></div>`+
  pwf("rp1","New password (8+ characters)","new-password")+
  pwf("rp2","Confirm new password","new-password")+
  `<button class="btn p" style="height:44px" id="reset-btn">Set new password</button>`+
  `</form>`
);
const login=()=>authCard("Log in","Sign in to your TenderBridge account.",`<form data-form="login" class="fg" style="grid-template-columns:1fr" novalidate><div id="auth-banner-login"></div><div><label for="em">Email</label><input id="em" type="email" autocomplete="email"><div class="err" id="e_em"></div></div>${pwf("pw","Password","current-password")}<div class="row"><label style="margin:0;font-weight:500"><input type="checkbox"> Remember me</label><a href="#/forgot">Forgot password?</a></div><button class="btn p" style="height:44px" id="login-btn">Log in</button><p class="mt" style="margin:0;text-align:center">New here? <a href="#/role">Sign up</a></p></form>`);
const signup=r=>authCard("Create your account","Choose your role, then we'll set up your profile.",`<form data-form="signup" class="fg" style="grid-template-columns:1fr" novalidate><div id="auth-banner-signup"></div><fieldset><legend>I am a</legend><div class="g2" style="gap:10px">${[["b","Business"],["o","Organization"]].map(([k,t])=>`<label class="rc" style="font-weight:600"><input type="radio" name="role" value="${k}" ${k===r?"checked":""}><span class="panel" style="padding:12px;display:block">${t}</span></label>`).join("")}</div></fieldset><div><label for="sn">Full name</label><input id="sn" autocomplete="name"><div class="err" id="e_sn"></div></div><div><label for="em">Email</label><input id="em" type="email" autocomplete="email"><div class="err" id="e_em"></div></div>${pwf("pw","Password (8+ characters)","new-password")}<button class="btn p" style="height:44px" id="signup-btn">Create account</button><p class="mt" style="margin:0;text-align:center">Have an account? <a href="#/login">Log in</a></p></form>`);
const forgot=()=>authCard("Reset your password","Enter your email and we'll send a reset link.",`<form data-form="forgot" class="fg" style="grid-template-columns:1fr" novalidate><div id="auth-banner-forgot"></div><div><label for="em">Email</label><input id="em" type="email"><div class="err" id="e_em"></div></div><button class="btn p" style="height:44px">Send reset link</button><a href="#/login" style="text-align:center">Back to log in</a></form>`);

// ─── router ───────────────────────────────────────────────────────────────────
function route(){
  const k=(location.hash||"#/").slice(2);
  const m=k.match(/^(b|o)\/onb\/(\d+)$/);
  const s=k.match(/^signup\/?(b|o)?$/);
  S.open=false;
  $("#scrim").classList.remove("open");
  if(!isSignedIn()&&!PUBLIC_ROUTES.has(k)&&!m&&!s){location.hash='#/login';return;}
  let h;
  const fr=()=>`<iframe id="dframe" title="Discover opportunities" style="width:100%;height:calc(100vh - 100px);min-height:560px;border:0;display:block"></iframe>`;
  const P={"discover":()=>pub(`<div style="max-width:1180px;margin:0 auto;padding:0 24px">${fr()}</div>`),"b/discover":()=>(S.role="b",shell(fr())),"o/discover":()=>(S.role="o",shell(fr())),"":landing,login,forgot,role,"reset-password":resetPassword,"b/overview":()=>dash("b"),"o/overview":()=>dash("o"),"b/profile":()=>profile("b"),"o/profile":()=>profile("o"),"b/documents":()=>(S.role="b",shell(head("Business","Documents","Registration, GST, MSME and previous work documents.")+docs("doc"))),"b/certs":()=>(S.role="b",shell(head("Business","Certifications","Quality and compliance certificates.")+docs("cert"))),"o/documents":()=>(S.role="o",shell(head("Organization","Documents","Registration and verification documents.")+docs("doc"))),"o/verification":verify,"b/notifications":()=>notes("b"),"o/notifications":()=>notes("o"),"b/account":()=>acct("b"),"o/account":()=>acct("o")};
  h=m?onb(m[1],+m[2]):s?signup(s[1]||"b"):(P[k]||landing)();
  if(h)$("#app").innerHTML=h;
  if($("#dframe"))$("#dframe").src="discover.html?embed=1";
  scrollTo(0,0);
}
addEventListener("hashchange",route);

// ─── events ───────────────────────────────────────────────────────────────────
document.addEventListener("click",async e=>{
  const t=e.target.closest("[data-a]");
  if(!t){if(S.open&&!e.target.closest(".bw")){S.open=false;route2()}return}
  const a=t.dataset.a,r=S.role;
  if(a==="menu"){$("#nav").classList.toggle("open");$("#scrim").classList.toggle("open")}
  else if(a==="bell"){S.open=!S.open;route2()}
  else if(a==="pw"){const i=$("#"+t.dataset.t),sh=i.type==="password";i.type=sh?"text":"password";t.textContent=sh?"Hide":"Show"}
  else if(a==="edit"){editing=true;route2()}
  else if(a==="cancel"){editing=false;route2();toast("Changes discarded.")}

  // ── SAVE PROFILE (data-a="save") ──────────────────────────────────────────
  else if(a==="save"){
    const fs=SEC[r].flatMap(s=>s[1]),o=collect(fs);
    if(!check(fs,o))return;
    const btn=$("#save-btn");
    if(btn){btn.textContent="Saving…";btn.disabled=true;}
    try{
      const user=await profileService.save(r,o);
      Object.assign(S.data[r],o);
      // Update session user_metadata from the returned user object.
      if(S.session)S.session={...S.session,user};
      editing=false;
      const banner=$("#profile-banner");
      if(banner)banner.innerHTML=infoBanner("Profile saved.");
      setTimeout(()=>{const b=$("#profile-banner");if(b)b.innerHTML="";},3000);
      route2();
      toast("Profile saved.");
    }catch(err){
      const banner=$("#profile-banner");
      if(banner)banner.innerHTML=authBanner(friendlyAuthError(err));
      toast("Could not save profile.","bad");
      if(btn){btn.textContent="Save changes";btn.disabled=false;}
    }
  }

  else if(a==="pick")$("#fi_"+t.dataset.kind).click();
  else if(a==="del"){S.docs[r][t.dataset.kind].splice(+t.dataset.i,1);route2();toast("Document removed.")}
  else if(a==="markall"){N.forEach(n=>n.r=1);route2()}
  else if(a==="back"){const n=+t.dataset.n;location.hash=n>1?`#/${t.dataset.r}/onb/${n-1}`:"#/role"}

  // ── ONBOARDING NEXT / COMPLETE (data-a="next") ────────────────────────────
  else if(a==="next"){
    const rr=t.dataset.r,n=+t.dataset.n,step=list(rr)[n-1];
    if(step.f){
      const o=collect(step.f);
      if(!check(step.f,o))return;
      Object.assign(S.data[rr],o);
    }
    if(step.rv){
      // Final step: validate all required fields are present.
      const miss=SEC[rr].flatMap(x=>x[1]).filter(f=>f.req&&!(S.data[rr][f.k]||"").length);
      if(miss.length){toast("Complete required fields before finishing.","bad");return}
      // Persist entire profile to Supabase before leaving onboarding.
      const btn=$("#onb-next");
      if(btn){btn.textContent="Saving…";btn.disabled=true;}
      const msg=$("#onb-msg");
      try{
        const user=await profileService.save(rr,S.data[rr]);
        await profileService.markOnboardingDone(rr);
        if(S.session)S.session={...S.session,user};
        location.hash=`#/${rr}/overview`;
        setTimeout(()=>toast("Profile complete. Welcome to TenderBridge."),50);
      }catch(err){
        if(msg)msg.innerHTML=authBanner("Could not save your profile. Your data is retained in this session — try completing again. "+friendlyAuthError(err));
        if(btn){btn.textContent="Complete profile";btn.disabled=false;}
      }
    } else {
      // Mid-step: save what we have so far, then advance.
      if(step.f){
        // Save silently; don't block navigation on failure.
        profileService.save(rr,S.data[rr]).catch(()=>{});
      }
      location.hash=`#/${rr}/onb/${n+1}`;
    }
  }

  // ── RESUBMIT VERIFICATION (data-a="resubmit-verify") ─────────────────────
  else if(a==="resubmit-verify"){
    const sb=getSB();
    if(sb)await sb.auth.updateUser({data:{verification_submitted_o:false}});
    if(S.session?.user?.user_metadata)S.session.user.user_metadata.verification_submitted_o=false;
    route2();
  }

  // ── SIGN-OUT ──────────────────────────────────────────────────────────────
  else if(a==="signout"){
    t.textContent="Signing out…";
    t.disabled=true;
    await auth.signOut();
    location.hash="#/login";
    toast("You have been signed out.");
  }
});

document.addEventListener("change",e=>{
  const i=e.target.dataset.up;
  if(!i)return;
  const ty=$("#dt_"+i).value;
  [...e.target.files].forEach(f=>{
    const d={n:f.name,t:ty,st:"Uploading",dt:TODAY};
    S.docs[S.role][i].push(d);
    /* supabase.storage.from("documents").upload(`${userId}/${f.name}`,f) */
    setTimeout(()=>{d.st="Uploaded";route2()},900);
  });
  route2();
  toast("Upload started.");
});

// ─── form submissions ─────────────────────────────────────────────────────────
document.addEventListener("submit",async e=>{
  e.preventDefault();
  const f=e.target.dataset.form;
  const v=id=>($("#"+id)||{}).value||"";
  const er=(id,m)=>{const x=$("#e_"+id);if(x)x.textContent=m;return !m};
  const banner=(bannerId,msg)=>{const el=$("#"+bannerId);if(el)el.innerHTML=msg?authBanner(msg):"";};

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if(f==="login"){
    const validEmail=er("em",/^\S+@\S+\.\S+$/.test(v("em"))?"":"Enter a valid email address.");
    const validPw=er("pw",v("pw")?"":"Enter your password.");
    if(!(validEmail&&validPw))return;
    banner("auth-banner-login","");
    const btn=$("#login-btn");
    if(btn){btn.textContent="Signing in…";btn.disabled=true;}
    try{
      const {role,user}=await auth.signIn(v("em"),v("pw"));
      const sb=getSB();
      const {data:sd}=sb?await sb.auth.getSession():{data:{}};
      applySession(sd?.session||{user},user);
      location.hash=`#/${role}/overview`;
    }catch(err){
      banner("auth-banner-login",friendlyAuthError(err));
    }finally{
      if(btn){btn.textContent="Log in";btn.disabled=false;}
    }
  }

  // ── SIGN-UP ────────────────────────────────────────────────────────────────
  else if(f==="signup"){
    const validName=er("sn",v("sn")?"":"Enter your name.");
    const validEmail=er("em",/^\S+@\S+\.\S+$/.test(v("em"))?"":"Enter a valid email address.");
    const validPw=er("pw",v("pw").length>=8?"":"Use at least 8 characters.");
    if(!(validName&&validEmail&&validPw))return;
    banner("auth-banner-signup","");
    const selectedRole=document.querySelector("[name=role]:checked")?.value||"b";
    const btn=$("#signup-btn");
    if(btn){btn.textContent="Creating account…";btn.disabled=true;}
    try{
      await auth.signUp(v("em"),v("pw"),selectedRole);
      const sb=getSB();
      const {data:sd}=sb?await sb.auth.getSession():{data:{}};
      if(sd?.session){
        applySession(sd.session,sd.session.user);
        S.data[selectedRole]={email:v("em")};
        S.docs[selectedRole]=selectedRole==="b"?{cert:[],doc:[]}:{doc:[]};
        location.hash=`#/${selectedRole}/onb/1`;
      }else{
        banner("auth-banner-signup","Account created! Check your email to confirm your address before signing in.");
        if(btn){btn.textContent="Create account";btn.disabled=false;}
      }
    }catch(err){
      banner("auth-banner-signup",friendlyAuthError(err));
      if(btn){btn.textContent="Create account";btn.disabled=false;}
    }
  }

  // ── FORGOT PASSWORD ────────────────────────────────────────────────────────
  else if(f==="forgot"){
    if(!er("em",/^\S+@\S+\.\S+$/.test(v("em"))?"":"Enter a valid email address."))return;
    banner("auth-banner-forgot","");
    try{
      await auth.reset(v("em"));
      banner("auth-banner-forgot","If an account exists for that email, a reset link has been sent. Check your inbox.");
    }catch(err){
      banner("auth-banner-forgot",friendlyAuthError(err));
    }
  }

  // ── ACCOUNT / CHANGE PASSWORD ──────────────────────────────────────────────
  else if(f==="acct"){
    const p=v("p1");
    if(p){
      if(p.length<8){er("p","Use at least 8 characters.");toast("Could not save changes.","bad");return}
      if(p!==v("p2")){er("p","Passwords do not match.");toast("Could not save changes.","bad");return}
      er("p","");
      try{await auth.updatePassword(p);toast("Password updated.");}
      catch(err){er("p",friendlyAuthError(err));toast("Could not update password.","bad");}
    }else{er("p","");toast("Account updated.");}
  }

  // ── RESET PASSWORD (recovery callback) ────────────────────────────────────
  else if(f==="reset-password"){
    const p=v("rp1"),p2=v("rp2");
    if(p.length<8){er("rp1","Use at least 8 characters.");return}
    if(p!==p2){er("rp2","Passwords do not match.");return}
    er("rp1","");er("rp2","");
    banner("auth-banner-reset","");
    const btn=$("#reset-btn");
    if(btn){btn.textContent="Saving…";btn.disabled=true;}
    try{
      await auth.updatePassword(p);
      await auth.signOut();
      toast("Password updated. Please sign in with your new password.");
      location.hash="#/login";
    }catch(err){
      banner("auth-banner-reset",friendlyAuthError(err));
      if(btn){btn.textContent="Set new password";btn.disabled=false;}
    }
  }

  // ── ORGANIZATION VERIFICATION SUBMISSION ──────────────────────────────────
  // Calls POST /api/v1/verification-requests on the shared Node backend.
  // NOTE: Requires app_metadata.role = "ORGANIZATION" in the JWT.
  // See BLOCKERS in the implementation report.
  else if(f==="verify-org"){
    // Inline field validation
    let ok=true;
    const req=(id,label)=>{if(!v(id)){const el=$("#e_"+id);if(el)el.textContent=label+" is required.";ok=false;}else{const el=$("#e_"+id);if(el)el.textContent="";}};
    req("vf_name","Organization name");
    req("vf_person","Contact person");
    if(!v("vf_email")||!/^\S+@\S+\.\S+$/.test(v("vf_email"))){const el=$("#e_vf_email");if(el)el.textContent="Enter a valid email address.";ok=false;}else{const el=$("#e_vf_email");if(el)el.textContent="";}
    if(!ok){toast("Please fix the highlighted fields.","bad");return;}
    banner("verify-banner","");
    const btn=$("#verify-btn");
    if(btn){btn.textContent="Submitting…";btn.disabled=true;}
    try{
      await apiRequest("/api/v1/verification-requests",{
        method:"POST",
        body:{
          type:"ORGANIZATION",
          organizationName:v("vf_name"),
          contactPerson:v("vf_person"),
          email:v("vf_email"),
          contactPhone:v("vf_phone")||null,
          registrationNo:v("vf_reg")||null,
          documents:[],
        },
      });
      // Mark as submitted in user_metadata so the UI updates across sessions.
      const sb=getSB();
      if(sb){
        const {data:ud}=await sb.auth.updateUser({data:{verification_submitted_o:true}});
        if(S.session&&ud?.user)S.session={...S.session,user:ud.user};
      }
      toast("Verification request submitted.");
      route2();
    }catch(err){
      const msg=err.status===403
        ?"Your account role has not been configured for organization access yet. Ask your administrator to set app_metadata.role = ORGANIZATION in Supabase."
        :friendlyAuthError(err);
      banner("verify-banner",msg);
      if(btn){btn.textContent="Submit verification request";btn.disabled=false;}
    }
  }
});

// ─── route helper ─────────────────────────────────────────────────────────────
const route2=()=>{const y=scrollY;route();scrollTo(0,y)};
$("#scrim").onclick=()=>{$("#nav")?.classList.remove("open");$("#scrim").classList.remove("open")};

// ─── boot: restore session, then render ──────────────────────────────────────
(async function boot(){
  const sb=getSB();
  if(sb){
    const {data}=await sb.auth.getSession();
    if(data?.session){
      applySession(data.session,data.session.user);
    }else{
      S.data={b:{},o:{}};
      seedDocs();
    }
    sb.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'||!session){
        S.session=null;
        const k=(location.hash||'#/').slice(2);
        if(!PUBLIC_ROUTES.has(k))location.hash='#/login';
      }else if(event==='PASSWORD_RECOVERY'){
        S.session=session;
        location.hash='#/reset-password';
      }else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'){
        S.session=session;
        // Refresh persisted profile data in case it was updated elsewhere.
        loadProfileFromUser(session.user);
      }
    });
  }else{
    console.warn('[TenderBridge] Supabase is not configured. Fill in assets/supabase.js.');
    S.data={b:{},o:{}};
    seedDocs();
  }
  if(!location.hash)location.hash=window.TB_START||'#/';
  route();
})();
