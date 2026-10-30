import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const cfg = window.FIREBASE_CONFIG;
const configured = cfg && cfg.apiKey && !cfg.apiKey.startsWith("PASTE_");
let auth = null, currentUser = null, profile = {role:"student"}, mode = "login";
const $ = id => document.getElementById(id);
const api = async (url, options={}) => {
  const token = currentUser ? await currentUser.getIdToken() : "";
  const response = await fetch(url,{...options,headers:{...(options.headers||{}),...(token?{Authorization:`Bearer ${token}`}:{})}});
  const data = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error || "Request failed");
  return data;
};
function message(id, text){ $(id).textContent = text; }
function setMode(next){mode=next;$("loginTab").classList.toggle("active",mode==="login");$("signupTab").classList.toggle("active",mode==="signup");$("nameLabel").classList.toggle("hidden",mode!=="signup");$("authSubmit").textContent=mode==="login"?"Sign in":"Create account";$("password").autocomplete=mode==="login"?"current-password":"new-password";message("authMessage","");}
$("loginTab").onclick=()=>setMode("login");$("signupTab").onclick=()=>setMode("signup");
$("authForm").onsubmit=async e=>{
 e.preventDefault();if(!configured){message("authMessage","Add your Firebase web config in firebase-config.js first.");return;}
 const email=$("email").value.trim(),password=$("password").value,name=$("name").value.trim();
 try{
  if(mode==="signup"){const cred=await createUserWithEmailAndPassword(auth,email,password);if(name)await updateProfile(cred.user,{displayName:name});currentUser=cred.user;await api("/api/profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({displayName:name})});}
  else {const cred=await signInWithEmailAndPassword(auth,email,password);currentUser=cred.user;await api("/api/profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({displayName:cred.user.displayName||"User"})});}
 }catch(err){message("authMessage",err.message);}
};
function showPage(page){
 document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
 $(page+"Page").classList.remove("hidden");
 document.querySelectorAll(".nav-item[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
 $("pageTitle").textContent=({overview:"Overview",chat:"AI Assistant",study:"Study & Quiz",notes:"My Notes",schedule:"Timetable",files:"Files",admin:"Administration"})[page]||page;
 if(page==="notes")loadNotes();
}
document.querySelectorAll(".nav-item[data-page]").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>showPage(b.dataset.go));
$("logoutBtn").onclick=()=>signOut(auth);
$("themeBtn").onclick=()=>document.body.classList.toggle("dark");
function addBubble(role,text){const d=document.createElement("div");d.className="bubble "+role;d.textContent=text;$("chatLog").appendChild(d);$("chatLog").scrollTop=$("chatLog").scrollHeight;return d;}
let history=[];
$("chatForm").onsubmit=async e=>{
 e.preventDefault();const text=$("chatInput").value.trim();if(!text)return;$("chatInput").value="";addBubble("user",text);history.push({role:"user",content:text});
 const wait=addBubble("assistant","Thinking…");
 try{const data=await api("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:history})});wait.textContent=data.reply;history.push({role:"assistant",content:data.reply});}
 catch(err){wait.textContent=err.message;}
};
document.querySelectorAll(".prompt-chips button").forEach(b=>b.onclick=()=>{$("chatInput").value=b.textContent;$("chatInput").focus();});
$("voiceBtn").onclick=()=>{
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){addBubble("assistant","Voice input is not supported in this browser. Try Chrome.");return;}
 const rec=new SR();rec.lang="en-IN";rec.onresult=e=>$("chatInput").value=e.results[0][0].transcript;rec.start();
};
async function loadNotes(){
 try{const notes=await api("/api/notes");$("noteCount").textContent=notes.length+" saved";$("notesList").replaceChildren();
 notes.forEach(n=>{const box=document.createElement("article");box.className="note-item";const content=document.createElement("div");const h=document.createElement("b");h.textContent=n.title;const p=document.createElement("p");p.textContent=n.body;content.append(h,p);const del=document.createElement("button");del.className="danger";del.textContent="Delete";del.onclick=async()=>{await api("/api/notes/"+n.id,{method:"DELETE"});loadNotes();};box.append(content,del);$("notesList").append(box);});
 }catch(err){$("notesList").textContent=err.message;}
}
$("noteForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/notes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:$("noteTitle").value,body:$("noteBody").value})});$("noteForm").reset();loadNotes();}catch(err){alert(err.message);}};
function loadEvents(){const items=JSON.parse(localStorage.getItem("nexoraEvents")||"[]").sort((a,b)=>a.time.localeCompare(b.time));$("eventsList").replaceChildren();items.forEach((ev,i)=>{const d=document.createElement("div");d.className="event-item";const s=document.createElement("span");s.textContent=ev.time+" — "+ev.text;const x=document.createElement("button");x.className="danger";x.textContent="Remove";x.onclick=()=>{items.splice(i,1);localStorage.setItem("nexoraEvents",JSON.stringify(items));loadEvents();};d.append(s,x);$("eventsList").append(d);});}
$("eventForm").onsubmit=e=>{e.preventDefault();const items=JSON.parse(localStorage.getItem("nexoraEvents")||"[]");items.push({time:$("eventTime").value,text:$("eventText").value});localStorage.setItem("nexoraEvents",JSON.stringify(items));$("eventForm").reset();loadEvents();};loadEvents();
$("makeQuiz").onclick=async()=>{
 const topic=$("quizTopic").value.trim();if(!topic){alert("Enter a topic first.");return;}
 $("quizArea").textContent="Generating questions…";
 try{
 const prompt=`Create exactly ${$("quizCount").value} multiple-choice questions about ${topic}. Return ONLY valid JSON array. Each item: {"question":"...","options":["A...","B...","C...","D..."],"answer":0,"explanation":"..."}. answer is zero-based index.`;
 const data=await api("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:[{role:"user",content:prompt}]})});
 let raw=data.reply.replace(/^```json\s*/i,"").replace(/```$/,"").trim();const questions=JSON.parse(raw);renderQuiz(questions);
 }catch(err){$("quizArea").textContent="Quiz generation failed: "+err.message;}
};
function renderQuiz(qs){const area=$("quizArea");area.replaceChildren();let score=0,answered=0;qs.forEach((q,i)=>{const box=document.createElement("div");box.className="quiz-question";const title=document.createElement("b");title.textContent=`${i+1}. ${q.question}`;box.append(title);q.options.forEach((o,j)=>{const lab=document.createElement("label");const radio=document.createElement("input");radio.type="radio";radio.name="q"+i;radio.value=j;radio.style.display="inline-block";radio.style.width="auto";lab.append(radio,document.createTextNode(" "+o));box.append(lab);});const explain=document.createElement("p");explain.className="muted";box.append(explain);box.dataset.answer=q.answer;box.dataset.explanation=q.explanation||"";area.append(box);});
 const btn=document.createElement("button");btn.className="primary";btn.textContent="Submit quiz";btn.onclick=()=>{score=0;answered=0;area.querySelectorAll(".quiz-question").forEach(box=>{const chosen=box.querySelector("input:checked");if(chosen){answered++;if(Number(chosen.value)===Number(box.dataset.answer))score++;}box.querySelector("p").textContent="Correct answer: "+box.querySelectorAll("label")[Number(box.dataset.answer)].textContent+" — "+box.dataset.explanation;});btn.textContent=`Result: ${score}/${qs.length} (${answered} answered)`;};area.append(btn);
}
$("uploadForm").onsubmit=async e=>{e.preventDefault();const f=$("fileInput").files[0];if(!f)return;const fd=new FormData();fd.append("file",f);try{const data=await api("/api/upload",{method:"POST",body:fd});message("uploadStatus",data.message);}catch(err){message("uploadStatus",err.message);}};
$("loadUsers").onclick=async()=>{try{const users=await api("/api/admin/users");$("usersList").replaceChildren();users.forEach(u=>{const row=document.createElement("div");row.className="user-item";const info=document.createElement("span");info.textContent=`${u.displayName||u.email} — ${u.email} (${u.role})`;const sel=document.createElement("select");["student","teacher","admin"].forEach(r=>{const o=document.createElement("option");o.value=r;o.textContent=r;o.selected=r===u.role;sel.append(o);});const save=document.createElement("button");save.className="primary";save.textContent="Update";save.onclick=async()=>{await api("/api/admin/users/"+u.uid+"/role",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({role:sel.value})});alert("Role updated");};row.append(info,sel,save);$("usersList").append(row);});}catch(err){$("usersList").textContent=err.message;}};
function enterApp(user,p){
 currentUser=user;profile=p||{role:"student"};$("authView").classList.add("hidden");$("appView").classList.remove("hidden");
 const name=profile.displayName||user.displayName||user.email.split("@")[0];$("sideName").textContent=name;$("welcomeName").textContent="Hello, "+name+" 👋";$("sideRole").textContent=(profile.role||"student").toUpperCase();$("avatar").textContent=name[0].toUpperCase();$("topAvatar").textContent=name[0].toUpperCase();$("adminNav").classList.toggle("hidden",profile.role!=="admin");$("today").textContent=new Date().toLocaleDateString();showPage("overview");
}
if(configured){
 const app=initializeApp(cfg);auth=getAuth(app);
 onAuthStateChanged(auth,async user=>{if(!user){currentUser=null;$("appView").classList.add("hidden");$("authView").classList.remove("hidden");return;}
 currentUser=user;try{await api("/api/profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({displayName:user.displayName||"User"})});const p=await api("/api/profile");enterApp(user,p);}catch(err){message("authMessage",err.message);}
 });
}else{message("authMessage","Setup required: configure Firebase in public/firebase-config.js and server credentials.");}
