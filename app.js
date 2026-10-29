const $ = (id) => document.getElementById(id);
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
  renderMessages();
  $("message-input").focus();
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
  const answer=prompt("Как назвать новый чат?");
  if(!answer||!answer.trim())return;
  const name=answer.trim().slice(0,40);
  const chat={id:"local-"+Date.now(),name,avatar:Array.from(name)[0].toUpperCase(),color:"#477da8",preview:"Новый демо-чат",messages:[]};
  chats.unshift(chat);persistDemo();$("search").value="";showScreen("chats-screen");renderChats();openChat(chat.id);
}
function saveDisplayName(){
  $("display-name").value=$("display-name").value.trim().slice(0,40);
  persistDemo();
  const button=$("save-name");const oldText=button.textContent;button.textContent="Сохранено ✓";
  window.setTimeout(()=>{button.textContent=oldText;},1500);
}

document.querySelectorAll(".nav-button").forEach(button=>button.addEventListener("click",()=>showScreen(button.dataset.screen)));
$("search").addEventListener("input",renderChats);
$("message-form").addEventListener("submit",sendMessage);
$("new-chat").addEventListener("click",createChat);
$("find-contact").addEventListener("click",createChat);
$("back-to-chats").addEventListener("click",backToChats);
$("save-name").addEventListener("click",saveDisplayName);
renderChats();