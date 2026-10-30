const $ = (id) => document.getElementById(id);

// Public client configuration. Publishable/anon keys are designed for browser use;
// never put a service_role or secret key in frontend code.
const SUPABASE_URL = "https://vhnwoatkwzmgfcusiiga.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_a2FiQH6N-IBgadyNL04CCA_HDxWqW_E";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const starterChats = [
  {id:"welcome",name:"ReLooop",avatar:"R",color:"#318bd1",preview:"Добро пожаловать в ReLooop!",messages:[
    {text:"Привет! 👋",mine:false,time:"12:00"},
    {text:"Добро пожаловать в ReLooop!",mine:false,time:"12:00"},
    {text:"Это первая версия твоего собственного мессенджера.",mine:false,time:"12:00"}
  ]},
  {id:"saved",name:"Избранное",avatar:"★",color:"#8066c9",preview:"Твои сохранённые сообщения",messages:[]},
  {id:"notes",name:"Мои заметки",avatar:"✎",color:"#249d91",preview:"Записывай идеи здесь",messages:[]}
];
let chats = starterChats.map(chat=>({...chat,messages:chat.messages.map(message=>({...message}))}));
let currentChatId = null;
let currentScreen = "chats-screen";
let authMode = "login";
let currentUser = null;
let currentProfile = null;

try {
  const saved = JSON.parse(localStorage.getItem("relooop-demo-v1") || "null");
  if(saved && Array.isArray(saved.chats)) chats = saved.chats;
  if(saved && typeof saved.displayName === "string") $("display-name").value = saved.displayName;
} catch (error) {
  console.warn("Не удалось загрузить локальные демо-данные.", error);
}

function persistDemo(){
  try { localStorage.setItem("relooop-demo-v1",JSON.stringify({chats,displayName:$("display-name").value})); }
  catch(error) { console.warn("Браузер не разрешил сохранить демо-данные.",error); }
}
function escapeHTML(value){
  return String(value ?? "").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function validColor(color){return /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#477da8";}
function setAuthMessage(message, isError=false){
  const el=$("auth-message");el.textContent=message;el.classList.toggle("error",isError);
}
function setAuthMode(mode){
  authMode=mode;
  const signup=mode==="signup";
  $("show-login").classList.toggle("active",!signup);
  $("show-signup").classList.toggle("active",signup);
  $("username-label").hidden=!signup;$("auth-username").hidden=!signup;
  $("auth-username").required=signup;
  $("auth-password").autocomplete=signup?"new-password":"current-password";
  $("auth-submit").textContent=signup?"Создать аккаунт":"Войти";
  setAuthMessage("");
}
async function handleAuth(event){
  event.preventDefault();
  const email=$("auth-email").value.trim().toLowerCase();
  const password=$("auth-password").value;
  const username=$("auth-username").value.trim().toLowerCase();
  if(authMode==="signup"&&!/^[a-z0-9_]{3,24}$/.test(username)){
    setAuthMessage("Логин: 3–24 символа, только латинские буквы, цифры и _. ",true);return;
  }
  $("auth-submit").disabled=true;$("auth-submit").textContent="Подождите…";
  setAuthMessage("");
  try{
    if(authMode==="signup"){
      const {data,error}=await supabaseClient.auth.signUp({
        email,password,
        options:{
          data:{username,display_name:username},
          emailRedirectTo:"https://borgilovsana-ship-it.github.io/ReLooop/"
        }
      });
      if(error) throw error;
      if(data.session){
        currentUser=data.user;
        setAuthMessage("Аккаунт создан, открываем ReLooop…");
      }else{
        setAuthMessage("Аккаунт создан. Проверь почту и подтверди адрес, затем войди здесь.");
      }
    }else{
      const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
      if(error) throw error;
      currentUser=data.user;
      setAuthMessage("Вход выполнен, открываем ReLooop…");
    }
  }catch(error){
    setAuthMessage(authErrorMessage(error),true);
  }finally{
    $("auth-submit").disabled=false;$("auth-submit").textContent=authMode==="signup"?"Создать аккаунт":"Войти";
  }
}
function authErrorMessage(error){
  const msg=String(error?.message||"");
  if(/Invalid login credentials/i.test(msg)) return "Не удалось войти. Проверь почту и пароль.";
  if(/already registered/i.test(msg)) return "Этот адрес уже зарегистрирован. Попробуй войти.";
  if(/password/i.test(msg)&&/short|least|length/i.test(msg)) return "Пароль должен содержать не менее 8 символов.";
  if(/fetch|network/i.test(msg)) return "Нет соединения с сервером. Проверь интернет и попробуй снова.";
  if(/username|duplicate key|profiles_username_key/i.test(msg)) return "Этот логин уже занят. Выбери другой.";
  return msg || "Не получилось выполнить действие. Попробуй ещё раз.";
}
async function ensureProfile(preferredUsername=""){
  if(!currentUser) return;
  const {data:existing,error:selectError}=await supabaseClient.from("profiles").select("id,username,display_name").eq("id",currentUser.id).maybeSingle();
  if(selectError) throw selectError;
  if(existing){currentProfile=existing;return;}
  const metadata=currentUser.user_metadata||{};
  const base=(preferredUsername||metadata.username||currentUser.email?.split("@")[0]||"user")
    .toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,20) || "user";
  let username=base;
  for(let i=0;i<4;i++){
    const {data,error}=await supabaseClient.from("profiles").insert({
      id:currentUser.id,username,display_name:String(metadata.display_name||username).slice(0,40)
    }).select("id,username,display_name").single();
    if(!error){currentProfile=data;return;}
    if(error.code==="23505"){username=(base.slice(0,17)+"_"+Math.random().toString(36).slice(2,6)).slice(0,24);continue;}
    throw error;
  }
  throw new Error("Не удалось создать профиль. Попробуй войти ещё раз.");
}
function showAuthenticatedApp(){
  $("auth-screen").hidden=true;$("app-content").hidden=false;
  $("account-email").textContent=currentUser?.email||"Аккаунт ReLooop";
  $("account-username").textContent=currentProfile?.username?"Логин: @"+currentProfile.username:"";
  $("profile-detail-email").textContent=currentUser?.email||"—";
  $("settings-display-name").textContent=currentProfile?.display_name||"Мой профиль";
  $("settings-account-line").textContent=(currentUser?.email||"")+(currentProfile?.username?" • @"+currentProfile.username:"");
  $("settings-avatar").textContent=currentProfile?.display_name?Array.from(currentProfile.display_name)[0].toUpperCase():"R";
  try{const photo=localStorage.getItem("relooop-profile-photo");if(photo){$("settings-avatar").style.backgroundImage="url("+photo+")";$("settings-avatar").textContent="";}}catch(error){}
  $("profile-detail-username").textContent=currentProfile?.username?"@"+currentProfile.username:"@username";
  $("display-name").value=currentProfile?.display_name||"";
  try{const photo=localStorage.getItem("relooop-profile-photo");if(photo) $("profile-avatar").style.backgroundImage="url("+photo+")";}catch(error){}
  if(currentProfile?.display_name){
    $("display-name").value=currentProfile.display_name;
    $("profile-heading").textContent=currentProfile.display_name;
    if(!$("profile-avatar").style.backgroundImage)$("profile-avatar").textContent=Array.from(currentProfile.display_name)[0].toUpperCase();
  }
  renderChats();
}
async function handleSignOut(){
  const {error}=await supabaseClient.auth.signOut();
  if(error){alert("Не удалось выйти: "+authErrorMessage(error));return;}
  currentUser=null;currentProfile=null;
  $("app-content").hidden=true;$("auth-screen").hidden=false;
  $("auth-password").value="";setAuthMode("login");
}
function renderChats(){
  const query=$("search").value.trim().toLocaleLowerCase("ru");
  const list=$("chat-list");list.replaceChildren();
  const visible=chats.filter(chat=>chat.name.toLocaleLowerCase("ru").includes(query)||(chat.preview||"").toLocaleLowerCase("ru").includes(query));
  if(!visible.length){const empty=document.createElement("div");empty.className="empty-state";empty.textContent="Чаты не найдены";list.appendChild(empty);return;}
  visible.forEach(chat=>{
    const button=document.createElement("button");button.className="chat-row";button.type="button";
    const avatar=document.createElement("div");avatar.className="avatar";avatar.style.background=validColor(chat.color);avatar.textContent=chat.avatar;
    const info=document.createElement("div");info.className="chat-info";
    const titleLine=document.createElement("div");titleLine.className="chat-title-line";
    const title=document.createElement("span");title.className="chat-name";title.textContent=chat.name;
    const time=document.createElement("span");time.className="chat-time";time.textContent=chat.messages.length ? (chat.messages[chat.messages.length-1].time||"") : "";
    titleLine.append(title,time);
    const preview=document.createElement("div");preview.className="chat-preview";preview.textContent=chat.preview||"Нет сообщений";
    info.append(titleLine,preview);button.append(avatar,info);button.addEventListener("click",()=>openChat(chat.id));list.appendChild(button);
  });
}
function showScreen(screenId){
  currentScreen=screenId;closeConversation();
  document.body.classList.toggle("profile-mode",screenId==="profile-screen");
  document.body.classList.toggle("settings-mode",screenId==="settings-screen");
  document.querySelectorAll(".screen").forEach(screen=>screen.classList.toggle("active",screen.id===screenId));
  document.querySelectorAll(".nav-button").forEach(button=>button.classList.toggle("active",button.dataset.screen===screenId));
  $("topbar").hidden=false;$("bottom-nav").hidden=false;
}
function openChat(id){
  const chat=chats.find(item=>item.id===id);if(!chat)return;
  currentChatId=id;
  document.querySelectorAll(".screen").forEach(screen=>screen.classList.remove("active"));
  $("topbar").hidden=true;$("bottom-nav").hidden=true;
  $("conversation").classList.add("active");
  $("conversation-name").textContent=chat.name;$("conversation-avatar").textContent=chat.avatar;
  $("conversation-avatar").style.background=validColor(chat.color);
  renderMessages();$("message-input").focus();
}
function closeConversation(){
  $("conversation").classList.remove("active");
  $("topbar").hidden=false;$("bottom-nav").hidden=false;
}
function backToChats(){showScreen("chats-screen");}
function renderMessages(){
  const chat=chats.find(item=>item.id===currentChatId);if(!chat)return;
  const box=$("messages");box.replaceChildren();
  chat.messages.forEach(message=>{
    const bubble=document.createElement("div");bubble.className="message-bubble"+(message.mine?" mine":"");
    bubble.append(document.createTextNode(message.text));
    const meta=document.createElement("small");meta.className="message-meta";meta.textContent=(message.time||"")+(message.mine?" ✓":"");
    bubble.appendChild(meta);box.appendChild(bubble);
  });
  box.scrollTop=box.scrollHeight;
}
function sendMessage(event){
  event.preventDefault();const input=$("message-input");const text=input.value.trim();
  if(!text||!currentChatId)return;
  const chat=chats.find(item=>item.id===currentChatId);if(!chat)return;
  const time=new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
  chat.messages.push({text,mine:true,time});chat.preview="Вы: "+text;
  input.value="";persistDemo();renderMessages();renderChats();
}
function createChat(){
  const answer=prompt("Как назвать новый демо-чат?");
  if(!answer||!answer.trim())return;
  const name=answer.trim().slice(0,40);
  const chat={id:"local-"+Date.now(),name,avatar:Array.from(name)[0].toUpperCase(),color:"#477da8",preview:"Новый демо-чат",messages:[]};
  chats.unshift(chat);persistDemo();$("search").value="";showScreen("chats-screen");renderChats();openChat(chat.id);
}
async function saveDisplayName(){
  const displayName=$("display-name").value.trim().slice(0,40);
  if(!displayName){alert("Введи имя.");return;}
  const {data,error}=await supabaseClient.from("profiles").update({display_name:displayName}).eq("id",currentUser.id).select("id,username,display_name").single();
  if(error){alert("Не удалось сохранить имя: "+authErrorMessage(error));return;}
  currentProfile=data;persistDemo();
  $("profile-heading").textContent=displayName;
  if(!$("profile-avatar").style.backgroundImage)$("profile-avatar").textContent=Array.from(displayName)[0].toUpperCase();
  $("profile-edit-panel").hidden=true;
  $("account-username").textContent="Логин: @"+data.username;
  $("profile-detail-username").textContent="@"+data.username;
  const button=$("save-name");const oldText=button.textContent;button.textContent="Сохранено ✓";
  window.setTimeout(()=>{button.textContent=oldText;},1500);
}

$("show-login").addEventListener("click",()=>setAuthMode("login"));
$("show-signup").addEventListener("click",()=>setAuthMode("signup"));
$("auth-form").addEventListener("submit",handleAuth);
$("sign-out").addEventListener("click",handleSignOut);
document.querySelectorAll(".nav-button").forEach(button=>button.addEventListener("click",()=>showScreen(button.dataset.screen)));
$("search").addEventListener("input",renderChats);
$("message-form").addEventListener("submit",sendMessage);
$("new-chat").addEventListener("click",createChat);
$("find-contact").addEventListener("click",createChat);
$("back-to-chats").addEventListener("click",backToChats);
$("save-name").addEventListener("click",saveDisplayName);
$("choose-photo").addEventListener("click",()=>$("profile-photo-input").click());
$("profile-photo-input").addEventListener("change",event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(!file.type.startsWith("image/")){alert("Выбери файл изображения.");return;}
  if(file.size>2*1024*1024){alert("Фото должно быть не больше 2 МБ.");return;}
  const reader=new FileReader();
  reader.onload=()=>{
    const data=String(reader.result||"");
    $("profile-avatar").style.backgroundImage = 'url("' + data + '")';
    $("profile-avatar").textContent="";
    try{localStorage.setItem("relooop-profile-photo",data);}catch(error){alert("Не удалось сохранить фото на этом устройстве.");}
  };
  reader.readAsDataURL(file);
});
$("edit-profile").addEventListener("click",()=>{
  $("profile-edit-panel").hidden=!$("profile-edit-panel").hidden;
  if(!$("profile-edit-panel").hidden)$("display-name").focus();
});
$("profile-settings").addEventListener("click",()=>showScreen("settings-screen"));
$("profile-more").addEventListener("click",()=>showScreen("settings-screen"));
document.querySelectorAll("[data-profile-tab]").forEach(tab=>tab.addEventListener("click",()=>{
  document.querySelectorAll("[data-profile-tab]").forEach(item=>item.classList.toggle("active",item===tab));
  const labels={posts:["Публикаций пока нет...","Здесь будут отображаться твои публикации"],archive:["Архив пока пуст...","Сохранённые публикации появятся здесь"],gifts:["Подарков пока нет...","Здесь будут отображаться подарки"]};
  $("profile-empty-title").textContent=labels[tab.dataset.profileTab][0];
  $("profile-empty-description").textContent=labels[tab.dataset.profileTab][1];
}));
$("profile-add").addEventListener("click",()=>alert("Раздел публикаций пока в разработке."));
setAuthMode("login");
supabaseClient.auth.onAuthStateChange((event,session)=>{
  if(event==="SIGNED_OUT"){currentUser=null;currentProfile=null;$("app-content").hidden=true;$("auth-screen").hidden=false;return;}
  if(session?.user){
    currentUser=session.user;
    // Avoid making Supabase calls directly inside the auth callback.
    setTimeout(async()=>{try{await ensureProfile();showAuthenticatedApp();}catch(error){$("auth-screen").hidden=false;$("app-content").hidden=true;setAuthMessage(authErrorMessage(error),true);}},0);
  }
});

$("settings-search").addEventListener("click",()=>{showScreen("chats-screen");$("search").focus();});
$("settings-more").addEventListener("click",()=>alert("Дополнительные настройки ReLooop появятся позже."));
document.querySelectorAll("[data-setting]").forEach(row=>row.addEventListener("click",()=>{
  const key=row.dataset.setting;
  if(key==="account"){showScreen("profile-screen");return;}
  const messages={chats:"Настройки оформления чатов скоро появятся.",privacy:"Настройки конфиденциальности скоро появятся.",notifications:"Настройки уведомлений скоро появятся.",storage:"Управление памятью скоро появится.",folders:"Папки чатов скоро появятся.",devices:"Управление устройствами скоро появится.",battery:"Энергосбережение скоро появится.",language:"Сейчас доступен русский язык."};
  alert(messages[key]||"Этот раздел скоро появится.");
}));
