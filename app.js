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
let appInitPromise = null;
async function openUserApp(user){
  currentUser=user;
  if(appInitPromise) return appInitPromise;
  appInitPromise=(async()=>{await ensureProfile();showAuthenticatedApp();})();
  try{await appInitPromise;}finally{appInitPromise=null;}
}

try {
  const saved = JSON.parse(localStorage.getItem("relooop-demo-v1") || "null");
  if(saved && Array.isArray(saved.chats)) chats = saved.chats;

} catch (error) {
  console.warn("Не удалось загрузить локальные демо-данные.", error);
}

function persistDemo(){
  try { localStorage.setItem("relooop-demo-v1",JSON.stringify({chats})); }
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
        setAuthMessage("Аккаунт создан, открываем ReLooop…");
        await openUserApp(data.user);
      }else{
        setAuthMessage("Аккаунт создан. Проверь почту и подтверди адрес, затем войди здесь.");
      }
    }else{
      const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
      if(error) throw error;
      setAuthMessage("Вход выполнен, открываем ReLooop…");
      await openUserApp(data.user);
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
  const {data:existing,error:selectError}=await supabaseClient.from("profiles").select("id,username,username_changed_at").eq("id",currentUser.id).maybeSingle();
  if(selectError) throw selectError;
  if(existing){currentProfile=existing;return;}
  const metadata=currentUser.user_metadata||{};
  const base=(preferredUsername||metadata.username||currentUser.email?.split("@")[0]||"user")
    .toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,20) || "user";
  let username=base;
  for(let i=0;i<4;i++){
    const {data,error}=await supabaseClient.from("profiles").insert({
      id:currentUser.id,username,display_name:username
    }).select("id,username,display_name,username_changed_at").single();
    if(!error){currentProfile=data;return;}
    if(error.code==="23505"){username=(base.slice(0,17)+"_"+Math.random().toString(36).slice(2,6)).slice(0,24);continue;}
    throw error;
  }
  throw new Error("Не удалось создать профиль. Попробуй войти ещё раз.");
}
function showAuthenticatedApp(){
  $("auth-screen").hidden=true;$("app-content").hidden=false;
  $("account-email").textContent=currentUser?.email||"Аккаунт ReLooop";
  $("account-username").textContent=currentProfile?.username?"Имя пользователя: @"+currentProfile.username:"";
  $("profile-detail-email").textContent=currentUser?.email||"—";
  $("settings-display-name").textContent=currentProfile?.username||"Мой профиль";
  $("settings-account-line").textContent=(currentUser?.email||"")+(currentProfile?.username?" • @"+currentProfile.username:"");
  $("settings-avatar").textContent=currentProfile?.username?Array.from(currentProfile.username)[0].toUpperCase():"R";
  try{const photo=localStorage.getItem("relooop-profile-photo");if(photo){$("settings-avatar").style.backgroundImage="url("+photo+")";$("settings-avatar").textContent="";}}catch(error){}
  $("profile-detail-username").textContent=currentProfile?.username?"@"+currentProfile.username:"@username";
  $("username-input").value=currentProfile?.username||"";
  updateUsernameCooldown();

  try{const photo=localStorage.getItem("relooop-profile-photo");if(photo) $("profile-avatar").style.backgroundImage="url("+photo+")";}catch(error){}
  $("profile-heading").textContent=currentProfile?.username||"Мой профиль";
  $("profile-username-handle").textContent=currentProfile?.username?"@"+currentProfile.username:"@username";
  $("settings-username-hint").textContent=currentProfile?.username?"@"+currentProfile.username+" · изменить":"Изменить имя пользователя";
  if(!$("profile-avatar").style.backgroundImage)$("profile-avatar").textContent=Array.from(currentProfile?.username||"R")[0].toUpperCase();
  document.body.classList.add("chats-mode");
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
  $("chat-count").textContent=String(chats.length);
  if(!visible.length){const empty=document.createElement("div");empty.className="empty-state";empty.textContent="Чаты не найдены";list.appendChild(empty);return;}
  visible.forEach(chat=>{
    const button=document.createElement("button");button.className="chat-row";button.type="button";
    const avatar=document.createElement("div");avatar.className="avatar";avatar.style.background=validColor(chat.color);avatar.textContent=chat.avatar;
    const info=document.createElement("div");info.className="chat-info";
    const titleLine=document.createElement("div");titleLine.className="chat-title-line";
    const title=document.createElement("span");title.className="chat-name";title.textContent=chat.name;
    const time=document.createElement("span");time.className="chat-time";time.textContent=chat.messages.length?(chat.messages[chat.messages.length-1].time||""):"";
    titleLine.append(title,time);
    const preview=document.createElement("div");preview.className="chat-preview";preview.textContent=chat.preview||"Нет сообщений";
    info.append(titleLine,preview);button.append(avatar,info);button.addEventListener("click",()=>openChat(chat.id));list.appendChild(button);
  });
}
async function loadUsers(force=false){
 const list=$("users-list");if(usersLoaded&&!force){renderUsers();return;}
 list.replaceChildren();const loading=document.createElement("div");loading.className="users-state";loading.textContent="Загружаем пользователей…";list.appendChild(loading);$("users-count").textContent="Загрузка…";
 const {data,error}=await supabaseClient.from("profiles").select("id,username").order("username",{ascending:true}).limit(100);
 if(error){list.replaceChildren();const state=document.createElement("div");state.className="users-state";state.textContent="Не удалось загрузить юзеров.";const retry=document.createElement("button");retry.className="users-retry";retry.textContent="Повторить";retry.addEventListener("click",()=>loadUsers(true));state.appendChild(retry);list.appendChild(state);$("users-count").textContent="";return;}
 usersCache=data||[];usersLoaded=true;renderUsers();
}
function renderUsers(){
 if(selectedUser)return;const q=$("users-search-input").value.trim().toLocaleLowerCase("ru");const visible=usersCache.filter(u=>(u.username||"").toLocaleLowerCase("ru").includes(q));const list=$("users-list");list.replaceChildren();$("users-count").textContent=usersCache.length+(usersCache.length===100?"+":"")+" пользователей";
 if(!visible.length){const state=document.createElement("div");state.className="users-state";state.textContent=q?"Никого не нашли.":"Пока нет зарегистрированных пользователей.";list.appendChild(state);return;}
 visible.forEach(u=>{const row=document.createElement("button");row.type="button";row.className="user-row";const avatar=document.createElement("span");avatar.className="user-row-avatar";avatar.textContent=Array.from(u.username||"U")[0].toUpperCase();const info=document.createElement("span");info.className="user-row-info";const name=document.createElement("strong");name.textContent="@"+u.username;const nick=document.createElement("small");nick.textContent="@"+u.username;info.append(name,nick);const arrow=document.createElement("b");arrow.textContent="›";row.append(avatar,info,arrow);row.addEventListener("click",()=>openUserProfile(u));list.appendChild(row);});
}
function openUserProfile(u){selectedUser=u;$("users-list").hidden=true;$("users-search").hidden=true;$("user-profile-view").hidden=false;$("user-view-avatar").textContent=Array.from(u.username||"U")[0].toUpperCase();$("user-view-name").textContent="@"+u.username;$("user-view-username").textContent="Имя пользователя ReLooop";}
function closeUserProfile(){selectedUser=null;$("users-list").hidden=false;$("users-search").hidden=false;$("user-profile-view").hidden=true;renderUsers();}

function showScreen(screenId){
  currentScreen=screenId;closeConversation();
  document.body.classList.toggle("profile-mode",screenId==="profile-screen");
  document.body.classList.toggle("settings-mode",screenId==="settings-screen");
  document.body.classList.toggle("contacts-mode",screenId==="contacts-screen");
  document.body.classList.toggle("chats-mode",screenId==="chats-screen");
  document.body.classList.toggle("users-mode",screenId==="users-screen");
  document.querySelectorAll(".screen").forEach(screen=>screen.classList.toggle("active",screen.id===screenId));
  document.querySelectorAll(".nav-button").forEach(button=>button.classList.toggle("active",button.dataset.screen===screenId));
  $("topbar").hidden=false;$("bottom-nav").hidden=false;
  if(screenId==="users-screen")loadUsers();
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
function updateUsernameCooldown(){
  const changedAt=currentProfile?.username_changed_at?new Date(currentProfile.username_changed_at):null;
  const remaining=changedAt?changedAt.getTime()+7*24*60*60*1000-Date.now():0;
  const button=$("save-username");
  if(remaining>0){
    const days=Math.floor(remaining/86400000);
    const hours=Math.floor((remaining%86400000)/3600000);
    const minutes=Math.ceil((remaining%3600000)/60000);
    $("username-cooldown").textContent="Следующая смена через "+(days?days+" дн. ":"")+(hours?hours+" ч. ":"")+minutes+" мин.";
    button.disabled=true;
    button.textContent="Изменение пока недоступно";
  }else{
    $("username-cooldown").textContent="Имя пользователя можно менять раз в 7 дней.";
    button.disabled=false;
    button.textContent="Сохранить имя пользователя";
  }
}
async function saveUsername(){
  const username=$("username-input").value.trim().toLowerCase();
  if(!/^[a-z0-9_]{3,24}$/.test(username)){
    alert("Имя пользователя: 3–24 символа, только латинские буквы, цифры и _.");return;
  }
  if(username===currentProfile?.username){alert("Это уже твоё имя пользователя.");return;}
  updateUsernameCooldown();
  if($("save-username").disabled){alert("Имя пользователя можно менять только раз в 7 дней.");return;}
  const button=$("save-username");button.disabled=true;button.textContent="Сохраняем…";
  const {data,error}=await supabaseClient.from("profiles").update({username}).eq("id",currentUser.id).select("id,username,display_name,username_changed_at").single();
  if(error){
    button.disabled=false;button.textContent="Изменить никнейм";
    const message=String(error.message||"");
    if(message.includes("USERNAME_CHANGE_COOLDOWN")){
      alert("Никнейм можно менять только раз в 7 дней. Попробуй позже.");
      const {data:profile}=await supabaseClient.from("profiles").select("id,username,display_name,username_changed_at").eq("id",currentUser.id).single();
      if(profile)currentProfile=profile;
      $("username-input").value=currentProfile?.username||"";
      updateUsernameCooldown();
    }else if(error.code==="23505"){
      alert("Такой никнейм уже занят. Выбери другой.");
    }else{
      alert("Не удалось изменить никнейм: "+authErrorMessage(error));
    }
    return;
  }
  currentProfile=data;
  $("username-input").value=data.username;
  $("profile-detail-username").textContent="@"+data.username;
  $("profile-heading").textContent=data.username;
  $("profile-username-handle").textContent="@"+data.username;
  $("settings-username-hint").textContent="@"+data.username+" · изменить";
  $("settings-display-name").textContent=data.username;
  $("settings-avatar").textContent=Array.from(data.username)[0].toUpperCase();
  $("account-username").textContent="Имя пользователя: @"+data.username;
  $("settings-account-line").textContent="@"+data.username;
  updateUsernameCooldown();
  alert("Имя пользователя успешно изменено!");
}


$("show-login").addEventListener("click",()=>setAuthMode("login"));
$("show-signup").addEventListener("click",()=>setAuthMode("signup"));
$("auth-form").addEventListener("submit",handleAuth);
$("sign-out").addEventListener("click",handleSignOut);
document.querySelectorAll(".nav-button").forEach(button=>button.addEventListener("click",()=>showScreen(button.dataset.screen)));
$("search").addEventListener("input",renderChats);
$("message-form").addEventListener("submit",sendMessage);
$("new-chat").addEventListener("click",createChat);

$("back-to-chats").addEventListener("click",backToChats);

$("save-username").addEventListener("click",saveUsername);
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
  if(!$("profile-edit-panel").hidden)$("username-input").focus();
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
    setTimeout(async()=>{try{await openUserApp(session.user);}catch(error){$("auth-screen").hidden=false;$("app-content").hidden=true;setAuthMessage("Вход выполнен, но не удалось загрузить профиль: "+authErrorMessage(error),true);}},0);
  }
});

$("settings-search").addEventListener("click",()=>{showScreen("chats-screen");$("search").focus();});
$("settings-more").addEventListener("click",()=>alert("Дополнительные настройки ReLooop появятся позже."));
document.querySelectorAll("[data-setting]").forEach(row=>row.addEventListener("click",()=>{
  const key=row.dataset.setting;
  if(key==="account"){showScreen("profile-screen");$("profile-edit-panel").hidden=false;$("username-input").focus();return;}
  const messages={chats:"Настройки оформления чатов скоро появятся.",privacy:"Настройки конфиденциальности скоро появятся.",notifications:"Настройки уведомлений скоро появятся.",storage:"Управление памятью скоро появится.",folders:"Папки чатов скоро появятся.",devices:"Управление устройствами скоро появится.",battery:"Энергосбережение скоро появится.",language:"Сейчас доступен русский язык."};
  alert(messages[key]||"Этот раздел скоро появится.");
}));

$("users-search-input").addEventListener("input",renderUsers);
$("user-profile-back").addEventListener("click",closeUserProfile);
$("contacts-search-input").addEventListener("input",()=>{
  const empty=$("contacts-list").querySelector(".contacts-empty");
  if(empty){const q=$("contacts-search-input").value.trim();empty.querySelector("strong").textContent=q?"Ничего не найдено":"Пока нет контактов";}
});
$("invite-friends").addEventListener("click",()=>{
  if(navigator.share){navigator.share({title:"Присоединяйся к ReLooop",text:"Давай общаться в ReLooop!",url:"https://borgilovsana-ship-it.github.io/ReLooop/"}).catch(()=>{});}
  else if(navigator.clipboard){navigator.clipboard.writeText("https://borgilovsana-ship-it.github.io/ReLooop/").then(()=>alert("Ссылка на ReLooop скопирована!")).catch(()=>alert("ReLooop: https://borgilovsana-ship-it.github.io/ReLooop/"));}
  else alert("ReLooop: https://borgilovsana-ship-it.github.io/ReLooop/");
});
$("recent-calls").addEventListener("click",()=>alert("История звонков появится, когда в ReLooop появятся звонки."));
$("contacts-sort").addEventListener("click",()=>alert("Контакты будут сортироваться по имени."));
$("contacts-add").addEventListener("click",()=>alert("Поиск и добавление пользователей добавим отдельным обновлением."));

$("chats-fab").addEventListener("click",createChat);
$("chats-more").addEventListener("click",()=>showScreen("settings-screen"));
$("all-chats-tab").addEventListener("click",()=>{
  $("all-chats-tab").classList.add("active");$("games-tab").classList.remove("active");renderChats();
});
$("games-tab").addEventListener("click",()=>{
  $("games-tab").classList.add("active");$("all-chats-tab").classList.remove("active");
  $("chat-list").replaceChildren();const empty=document.createElement("div");empty.className="empty-state";empty.textContent="Игры появятся здесь позже."; $("chat-list").appendChild(empty);
});
