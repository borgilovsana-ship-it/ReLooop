const $ = (id) => document.getElementById(id);

// Public client configuration. Publishable/anon keys are designed for browser use;
// never put a service_role or secret key in frontend code.
const SUPABASE_URL = "https://vhnwoatkwzmgfcusiiga.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_a2FiQH6N-IBgadyNL04CCA_HDxWqW_E";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let chats = [];
let currentChatId = null;
let currentScreen = "chats-screen";
let authMode = "login";
let currentUser = null;
let currentProfile = null;
let appInitPromise = null;
let messagesChannel = null;
async function openUserApp(user){
  currentUser=user;
  if(appInitPromise) return appInitPromise;
  appInitPromise=(async()=>{await ensureProfile();await showAuthenticatedApp();})();
  try{await appInitPromise;}finally{appInitPromise=null;}
}

function escapeHTML(value){
  return String(value ?? "").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function validColor(color){return /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#477da8";}
const giftCatalog = [
  {id:"rose",name:"Роза",emoji:"🌹",rarity:"Обычный",className:"common"},
  {id:"star",name:"Звезда",emoji:"⭐",rarity:"Обычный",className:"common"},
  {id:"heart",name:"Сердце",emoji:"💖",rarity:"Обычный",className:"common"},
  {id:"teddy",name:"Мишка",emoji:"🧸",rarity:"Редкий",className:"rare"},
  {id:"cupcake",name:"Кексик",emoji:"🧁",rarity:"Редкий",className:"rare"},
  {id:"crown",name:"Корона",emoji:"👑",rarity:"Эпический",className:"epic"},
  {id:"diamond",name:"Алмаз",emoji:"💎",rarity:"Эпический",className:"epic"},
  {id:"rocket",name:"Ракета",emoji:"🚀",rarity:"Легендарный",className:"legendary"}
];
let ownedGiftIds = new Set();

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
  const {data:existing,error:selectError}=await supabaseClient.from("profiles").select("id,username,display_name,username_changed_at").eq("id",currentUser.id).maybeSingle();
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
async function loadUserGifts(){
  const {data,error}=await supabaseClient.from("user_gifts").select("gift_id").eq("user_id",currentUser.id);
  if(error){
    $("gift-status").textContent="Не удалось загрузить коллекцию. Попробуй обновить страницу.";
    console.error("loadUserGifts:",error);
    return;
  }
  ownedGiftIds=new Set((data||[]).map(row=>row.gift_id));
  renderGiftSections();
}
function makeGiftCard(gift,owned,showClaim){
  const card=document.createElement("article");
  card.className="gift-card rarity-"+gift.className;
  const visual=document.createElement("div");
  visual.className="gift-visual";
  visual.textContent=gift.emoji;
  const name=document.createElement("strong");
  name.textContent=gift.name;
  const rarity=document.createElement("span");
  rarity.className="gift-rarity";
  rarity.textContent=gift.rarity;
  card.append(visual,name,rarity);
  if(showClaim){
    const button=document.createElement("button");
    button.type="button";
    button.className="gift-claim-button";
    button.dataset.claimGift=gift.id;
    button.disabled=owned;
    button.textContent=owned?"В коллекции":"Получить";
    card.append(button);
  }
  return card;
}
function renderGiftSections(){
  const collection=$("gift-collection");
  const catalog=$("gift-catalog");
  if(!collection||!catalog)return;
  collection.replaceChildren();
  catalog.replaceChildren();
  const owned=giftCatalog.filter(gift=>ownedGiftIds.has(gift.id));
  $("gift-owned-count").textContent=owned.length+" / "+giftCatalog.length;
  if(!owned.length){
    const empty=document.createElement("p");
    empty.className="gift-empty";
    empty.textContent="Пока пусто. Выбери первый подарок в каталоге ниже!";
    collection.append(empty);
  }else{
    owned.forEach(gift=>collection.append(makeGiftCard(gift,true,false)));
  }
  giftCatalog.forEach(gift=>catalog.append(makeGiftCard(gift,ownedGiftIds.has(gift.id),true)));
}
async function claimGift(giftId){
  const gift=giftCatalog.find(item=>item.id===giftId);
  if(!gift||ownedGiftIds.has(giftId))return;
  const button=document.querySelector('[data-claim-gift="'+giftId+'"]');
  if(button){button.disabled=true;button.textContent="Добавляем…";}
  $("gift-status").textContent="";
  const {error}=await supabaseClient.from("user_gifts").insert({user_id:currentUser.id,gift_id:giftId});
  if(error&&error.code!=="23505"){
    $("gift-status").textContent="Не получилось добавить подарок. Попробуй ещё раз.";
    if(button){button.disabled=false;button.textContent="Получить";}
    console.error("claimGift:",error);
    return;
  }
  ownedGiftIds.add(giftId);
  renderGiftSections();
  $("gift-status").textContent="Подарок «"+gift.name+"» добавлен в коллекцию!";
}

async function showAuthenticatedApp(){
  $("auth-screen").hidden=true;$("app-content").hidden=false;
  $("account-email").textContent=currentUser?.email||"Аккаунт ReLooop";
  $("account-username").textContent=currentProfile?.username?"Имя пользователя: @"+currentProfile.username:"";
  $("profile-detail-email").textContent=currentUser?.email||"—";
  $("settings-display-name").textContent=currentProfile?.display_name||currentProfile?.username||"Мой профиль";
  $("settings-account-line").textContent=(currentUser?.email||"")+(currentProfile?.username?" • @"+currentProfile.username:"");
  $("settings-avatar").textContent=currentProfile?.username?Array.from(currentProfile.username)[0].toUpperCase():"R";
  try{const photo=localStorage.getItem("relooop-profile-photo");if(photo){$("settings-avatar").style.backgroundImage="url("+photo+")";$("settings-avatar").textContent="";}}catch(error){}
  $("profile-detail-username").textContent=currentProfile?.username?"@"+currentProfile.username:"@username";
  $("username-input").value=currentProfile?.username||"";
  $("display-name-input").value=currentProfile?.display_name||"";
  $("settings-display-name-hint").textContent=currentProfile?.display_name||"Имя, которое увидят другие";
  updateUsernameCooldown();

  try{const photo=localStorage.getItem("relooop-profile-photo");if(photo) $("profile-avatar").style.backgroundImage="url("+photo+")";}catch(error){}
  $("profile-heading-text").textContent=currentProfile?.display_name||currentProfile?.username||"Мой профиль";
  $("profile-username-text").textContent=currentProfile?.username?"@"+currentProfile.username:"@username";
  $("profile-verified-badge").hidden=(currentProfile?.username||"").toLowerCase()!=="vip";
  $("settings-username-hint").textContent=currentProfile?.username?"@"+currentProfile.username+" · изменить":"Изменить имя пользователя";
  if(!$("profile-avatar").style.backgroundImage)$("profile-avatar").textContent=Array.from(currentProfile?.username||"R")[0].toUpperCase();
  document.body.classList.add("chats-mode");
  $("conversation-status").textContent="Личная переписка";
  $("demo-notice").hidden=true;
  await loadConversations();
  await loadUserGifts();
  subscribeToMessages();
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
  const visible=chats.filter(chat=>chat.name.toLocaleLowerCase("ru").includes(query)||chat.username.toLocaleLowerCase("ru").includes(query)||(chat.preview||"").toLocaleLowerCase("ru").includes(query));
  $("chat-count").textContent=String(chats.length);
  if(!visible.length){const empty=document.createElement("div");empty.className="empty-state";empty.textContent=query?"Чаты не найдены":"Пока нет переписок. Нажми ✎ и найди человека по @логину.";list.appendChild(empty);return;}
  visible.forEach(chat=>{
    const button=document.createElement("button");button.className="chat-row";button.type="button";
    const avatar=document.createElement("div");avatar.className="avatar";avatar.style.background=validColor(chat.color);avatar.textContent=chat.avatar;
    const info=document.createElement("div");info.className="chat-info";
    const titleLine=document.createElement("div");titleLine.className="chat-title-line";
    const title=document.createElement("span");title.className="chat-name";title.textContent=chat.name;
    const time=document.createElement("span");time.className="chat-time";time.textContent=chat.time||"";
    titleLine.append(title,time);
    const preview=document.createElement("div");preview.className="chat-preview";preview.textContent=chat.preview||"Написать сообщение";
    info.append(titleLine,preview);button.append(avatar,info);button.addEventListener("click",()=>openChat(chat.id));list.appendChild(button);
  });
}
async function loadConversations(){
  if(!currentUser)return;
  const {data:rows,error}=await supabaseClient.from("messages").select("id,sender_id,recipient_id,content,created_at").or("sender_id.eq."+currentUser.id+",recipient_id.eq."+currentUser.id).order("created_at",{ascending:false});
  if(error)throw error;
  const latestByPeer=new Map();
  (rows||[]).forEach(row=>{
    const peerId=row.sender_id===currentUser.id?row.recipient_id:row.sender_id;
    if(!latestByPeer.has(peerId))latestByPeer.set(peerId,row);
  });
  const peerIds=[...latestByPeer.keys()];
  let profiles=[];
  if(peerIds.length){
    const result=await supabaseClient.from("profiles").select("id,username,display_name").in("id",peerIds);
    if(result.error)throw result.error;
    profiles=result.data||[];
  }
  const profileMap=new Map(profiles.map(profile=>[profile.id,profile]));
  chats=peerIds.map(id=>{
    const profile=profileMap.get(id)||{username:"user",display_name:"Пользователь"};
    const last=latestByPeer.get(id);
    return {id,name:profile.display_name||profile.username,username:profile.username||"",avatar:Array.from(profile.display_name||profile.username||"R")[0].toUpperCase(),color:"#477da8",preview:(last.sender_id===currentUser.id?"Вы: ":"")+last.content,time:new Date(last.created_at).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})};
  });
  renderChats();
}
function subscribeToMessages(){
  if(messagesChannel)supabaseClient.removeChannel(messagesChannel);
  messagesChannel=supabaseClient.channel("private-messages-"+currentUser.id)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>{
      const row=payload.new;
      if(row.sender_id!==currentUser.id&&row.recipient_id!==currentUser.id)return;
      loadConversations().catch(error=>console.error("Не удалось обновить чаты",error));
      if(currentChatId&&(row.sender_id===currentChatId||row.recipient_id===currentChatId)){
        loadConversationMessages(currentChatId).catch(error=>console.error("Не удалось обновить сообщения",error));
      }
    }).subscribe();
}
function showScreen(screenId){
  currentScreen=screenId;closeConversation();
  document.body.classList.toggle("profile-mode",screenId==="profile-screen");
  document.body.classList.toggle("settings-mode",screenId==="settings-screen");
  document.body.classList.toggle("contacts-mode",screenId==="contacts-screen");
  document.body.classList.toggle("chats-mode",screenId==="chats-screen");
  document.querySelectorAll(".screen").forEach(screen=>screen.classList.toggle("active",screen.id===screenId));
  document.querySelectorAll(".nav-button").forEach(button=>button.classList.toggle("active",button.dataset.screen===screenId));
  $("premium-screen").hidden=true;\n  $("topbar").hidden=false;$("bottom-nav").hidden=false;
}
async function openChat(id){
  const chat=chats.find(item=>item.id===id);
  if(!chat)return;
  currentChatId=id;
  document.querySelectorAll(".screen").forEach(screen=>screen.classList.remove("active"));
  $("topbar").hidden=true;$("bottom-nav").hidden=true;
  $("conversation").classList.add("active");
  $("conversation-name").textContent=chat.name;
  $("conversation-avatar").textContent=chat.avatar;
  $("conversation-avatar").style.background=validColor(chat.color);
  $("conversation-status").textContent="@"+chat.username;
  $("demo-notice").hidden=true;
  await loadConversationMessages(id);
  $("message-input").focus();
}
function closeConversation(){
  $("conversation").classList.remove("active");
  $("topbar").hidden=false;$("bottom-nav").hidden=false;
}
function openPremium(){
  closeConversation();
  document.querySelectorAll(".screen").forEach(screen=>screen.classList.remove("active"));
  $("premium-screen").hidden=false;
  $("topbar").hidden=true;$("bottom-nav").hidden=true;
  document.body.classList.remove("profile-mode","settings-mode","contacts-mode","chats-mode");
  currentScreen="premium-screen";
}
$("premium-back").addEventListener("click",()=>showScreen("settings-screen"));
document.querySelectorAll(".premium-plan").forEach(plan=>plan.addEventListener("click",()=>{
  document.querySelectorAll(".premium-plan").forEach(item=>item.classList.toggle("selected",item===plan));
}));
$("premium-join").addEventListener("click",()=>alert("ReLooop Premium пока в разработке. Подписка и оплата ещё не подключены."));
function backToChats(){currentChatId=null;showScreen("chats-screen");}
async function loadConversationMessages(peerId){
  if(!currentUser)return;
  const {data,error}=await supabaseClient.from("messages").select("id,sender_id,recipient_id,content,created_at").or("and(sender_id.eq."+currentUser.id+",recipient_id.eq."+peerId+"),and(sender_id.eq."+peerId+",recipient_id.eq."+currentUser.id+")").order("created_at",{ascending:true});
  if(error)throw error;
  const box=$("messages");box.replaceChildren();
  (data||[]).forEach(message=>{
    const bubble=document.createElement("div");bubble.className="message-bubble"+(message.sender_id===currentUser.id?" mine":"");
    bubble.append(document.createTextNode(message.content));
    const meta=document.createElement("small");meta.className="message-meta";meta.textContent=new Date(message.created_at).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})+(message.sender_id===currentUser.id?" ✓":"");
    bubble.appendChild(meta);box.appendChild(bubble);
  });
  box.scrollTop=box.scrollHeight;
}
async function sendMessage(event){
  event.preventDefault();
  const input=$("message-input");const content=input.value.trim();
  if(!content||!currentChatId||!currentUser)return;
  const send=$("message-form").querySelector("button");
  send.disabled=true;
  try{
    const {error}=await supabaseClient.from("messages").insert({sender_id:currentUser.id,recipient_id:currentChatId,content});
    if(error)throw error;
    input.value="";
    await Promise.all([loadConversationMessages(currentChatId),loadConversations()]);
  }catch(error){alert("Не удалось отправить сообщение: "+authErrorMessage(error));}
  finally{send.disabled=false;input.focus();}
}
async function createChat(){
  const answer=prompt("Введи имя пользователя, например @alex:");
  if(!answer||!answer.trim())return;
  const username=answer.trim().replace(/^@/,"").toLowerCase();
  if(username===currentProfile?.username?.toLowerCase()){alert("Это твой собственный аккаунт.");return;}
  const {data:profile,error}=await supabaseClient.from("profiles").select("id,username,display_name").eq("username",username).maybeSingle();
  if(error){alert("Не удалось найти пользователя: "+authErrorMessage(error));return;}
  if(!profile){alert("Пользователь @"+username+" не найден.");return;}
  let chat=chats.find(item=>item.id===profile.id);
  if(!chat){
    chat={id:profile.id,name:profile.display_name||profile.username,username:profile.username,avatar:Array.from(profile.display_name||profile.username||"R")[0].toUpperCase(),color:"#477da8",preview:"Новая переписка",time:""};
    chats.unshift(chat);
  }
  $("search").value="";renderChats();openChat(profile.id);
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
async function saveDisplayName(){
  const displayName=$("display-name-input").value.trim();
  if(!displayName){alert("Напиши, как тебя называть.");return;}
  if(displayName.length>32){alert("Имя должно быть не длиннее 32 символов.");return;}
  const button=$("save-display-name");button.disabled=true;button.textContent="Сохраняем…";
  const {data,error}=await supabaseClient.from("profiles").update({display_name:displayName}).eq("id",currentUser.id).select("id,username,display_name,username_changed_at").single();
  button.disabled=false;button.textContent="Сохранить имя";
  if(error){alert("Не удалось сохранить имя: "+authErrorMessage(error));return;}
  currentProfile=data;
  $("profile-heading-text").textContent=data.display_name||data.username;
  $("settings-display-name").textContent=data.display_name||data.username;
  $("settings-display-name-hint").textContent=data.display_name||"Имя, которое увидят другие";
  $("profile-avatar").textContent=Array.from(data.display_name||data.username||"R")[0].toUpperCase();
  $("settings-avatar").textContent=Array.from(data.display_name||data.username||"R")[0].toUpperCase();
  $("settings-account-line").textContent=(currentUser?.email||"")+(data.username?" • @"+data.username:"");
  alert("Имя сохранено!");
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
  $("profile-heading-text").textContent=data.display_name||data.username;
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
$("save-display-name").addEventListener("click",saveDisplayName);
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
  const isGifts=tab.dataset.profileTab==="gifts";
  $("profile-empty").hidden=isGifts;
  $("profile-gifts-panel").hidden=!isGifts;
  if(!isGifts){
    const labels={posts:["Публикаций пока нет...","Здесь будут отображаться твои публикации"],archive:["Архив пока пуст...","Сохранённые публикации появятся здесь"]};
    $("profile-empty-title").textContent=labels[tab.dataset.profileTab][0];
    $("profile-empty-description").textContent=labels[tab.dataset.profileTab][1];
  }else{
    loadUserGifts();
  }
}));
$("gift-catalog").addEventListener("click",event=>{
  const button=event.target.closest("[data-claim-gift]");
  if(button)claimGift(button.dataset.claimGift);
});
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
  if(key==="display-name"){showScreen("profile-screen");$("profile-edit-panel").hidden=false;$("display-name-input").focus();return;}
  if(key==="username"){showScreen("profile-screen");$("profile-edit-panel").hidden=false;$("username-input").focus();return;}
  if(key==="premium"){openPremium();return;}
  const messages={chats:"Настройки оформления чатов скоро появятся.",privacy:"Настройки конфиденциальности скоро появятся.",notifications:"Настройки уведомлений скоро появятся.",storage:"Управление памятью скоро появится.",folders:"Папки чатов скоро появятся.",devices:"Управление устройствами скоро появится.",battery:"Энергосбережение скоро появится.",language:"Сейчас доступен русский язык.",premium:"ReLooop Premium пока в разработке. Платные функции ещё не подключены.",stars:"Звёзды ReLooop пока не используются. Мы добавим их вместе с системой подарков.",business:"Раздел для бизнеса находится в разработке.", "send-gift":"Открой вкладку «Профиль» → «Подарки», чтобы посмотреть свою коллекцию. Отправка подарков друзьям появится позже.", "ask-help":"Поддержка ReLooop пока готовится. Напиши нам позже через этот раздел.",faq:"ReLooop — мессенджер в разработке. Сейчас доступны регистрация, профиль и базовые чаты.",features:"В ReLooop уже есть аккаунты, профили, чаты и коллекция подарков. Остальные возможности добавляются постепенно.", "privacy-policy":"Мы используем Supabase для входа и хранения данных аккаунта и сообщений. Полная политика конфиденциальности ещё готовится."};
  alert(messages[key]||"Этот раздел скоро появится.");
}));

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
