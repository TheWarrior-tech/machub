// ---------- storage helpers ----------
const store = {
  get macs(){ try{return JSON.parse(localStorage.getItem('macs')||'[]')}catch(e){return []} },
  set macs(v){ localStorage.setItem('macs', JSON.stringify(v)) },
  get activity(){ try{return JSON.parse(localStorage.getItem('activity')||'[]')}catch(e){return []} },
  set activity(v){ localStorage.setItem('activity', JSON.stringify(v)) },
  get chats(){ try{return JSON.parse(localStorage.getItem('chats')||'[]')}catch(e){return []} },
  set chats(v){ localStorage.setItem('chats', JSON.stringify(v)) },
};

function logActivity(text){
  const a = store.activity;
  a.unshift({ text, time: new Date().toISOString() });
  store.activity = a.slice(0, 50);
}

function timeAgo(iso){
  const s = Math.floor((Date.now() - new Date(iso).getTime())/1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

// ---------- screen / tab navigation ----------
const screens = ['home','device','add','chats','chat','activity','more'];
function showScreen(id){
  screens.forEach(s => document.getElementById('screen-'+s).classList.toggle('hidden', s !== id));
}
function showTab(tab){
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tabbar').classList.remove('hidden');
  showScreen(tab === 'home' ? 'home' : tab);
  if (tab === 'home') renderHome();
  if (tab === 'chats') renderChatsList();
  if (tab === 'activity') renderActivity();
  if (tab === 'more') renderMore();
}
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=> showTab(btn.dataset.tab));
});

// ---------- Ollama API helpers ----------
function ollamaUrl(host, path){
  let h = host.trim();
  if (!h.includes(':')) h += ':11434';
  if (!h.startsWith('http')) h = 'http://' + h;
  return h.replace(/\/$/,'') + path;
}
async function pingMac(mac){
  try{
    const r = await fetch(ollamaUrl(mac.host, '/api/tags'), { method:'GET' });
    if (!r.ok) throw new Error('bad status');
    const data = await r.json();
    return { online:true, models: data.models || [] };
  }catch(e){
    return { online:false, models: [] };
  }
}

const CURATED_MODELS = [
  { name:'llama3.2', desc:'Meta\u2019s general-purpose chat model. Good default for everyday questions.', size:'2.0GB' },
  { name:'qwen2.5-coder', desc:'Coding-focused model, strong at reading and writing code.', size:'4.7GB' },
  { name:'phi4', desc:'Small, fast reasoning model from Microsoft. Light on memory.', size:'9.1GB' },
  { name:'mistral', desc:'Balanced general chat model with fast responses.', size:'4.1GB' },
];

// ---------- HOME ----------
function macThumbSvg(){
  return `<svg viewBox="0 0 200 200" class="mac-studio-svg" style="filter:none">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9e9ec"/><stop offset="1" stop-color="#b9bac0"/></linearGradient>
      <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5f5f7"/><stop offset="1" stop-color="#d4d5d9"/></linearGradient>
    </defs>
    <path d="M40 78 L100 50 L160 78 L160 132 L100 160 L40 132 Z" fill="url(#g1)"/>
    <path d="M40 78 L100 50 L160 78 L100 106 Z" fill="url(#g2)"/>
    <path d="M100 106 L160 78 L160 132 L100 160 Z" fill="#a9aab0"/>
  </svg>`;
}

async function renderHome(){
  const macs = store.macs;
  const populated = document.getElementById('home-populated');
  const empty = document.getElementById('home-empty');
  if (macs.length === 0){
    populated.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  populated.classList.remove('hidden');
  const list = document.getElementById('mac-list');
  list.innerHTML = macs.map((m,i)=>`
    <div class="mac-row" data-idx="${i}">
      <div class="thumb">${macThumbSvg()}</div>
      <div class="meta">
        <div class="name">${escapeHtml(m.name)}</div>
        <div class="status-line" id="row-status-${i}"><span class="badge-dot"></span> Checking\u2026</div>
      </div>
      <div class="dots"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></div>
    </div>`).join('');

  list.querySelectorAll('.mac-row').forEach(row=>{
    row.addEventListener('click', ()=> openDevice(parseInt(row.dataset.idx)));
  });

  macs.forEach(async (m,i)=>{
    const res = await pingMac(m);
    const el = document.getElementById('row-status-'+i);
    if (!el) return;
    if (res.online){
      el.className = 'status-line';
      el.innerHTML = '<span class="badge-dot"></span> Connected \u00b7 Tailscale';
    } else {
      el.className = 'status-line offline';
      el.innerHTML = '<span class="badge-dot" style="background:#8e8e93"></span> Offline';
    }
  });
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

document.getElementById('btn-add-mac-top').addEventListener('click', startAddFlow);
document.getElementById('btn-add-mac-1').addEventListener('click', startAddFlow);
document.getElementById('btn-add-mac-2').addEventListener('click', startAddFlow);

// ---------- ADD MAC FLOW ----------
let addStep = 1;
let pendingMac = {};
function startAddFlow(){
  addStep = 1; pendingMac = {};
  document.getElementById('input-name').value = '';
  document.getElementById('input-host').value = '';
  showAddStep();
  document.getElementById('tabbar').classList.add('hidden');
  showScreen('add');
}
function showAddStep(){
  ['1','2','3'].forEach(n => document.getElementById('setup-step-'+n).classList.toggle('hidden', String(addStep) !== n));
  document.getElementById('setup-step-label').textContent = `Step ${addStep} of 3`;
  document.getElementById('setup-progress-fill').style.width = (addStep/3*100)+'%';
  document.getElementById('btn-setup-next').textContent = addStep < 3 ? 'Continue' : 'Done';
}
document.getElementById('btn-add-cancel').addEventListener('click', ()=> showTab('home'));

document.getElementById('btn-setup-next').addEventListener('click', async ()=>{
  if (addStep === 1){
    const name = document.getElementById('input-name').value.trim();
    if (!name) return;
    pendingMac.name = name;
    addStep = 2; showAddStep();
  } else if (addStep === 2){
    const host = document.getElementById('input-host').value.trim();
    if (!host) return;
    pendingMac.host = host;
    addStep = 3; showAddStep();
    document.getElementById('connect-status-h').textContent = 'Connecting\u2026';
    document.getElementById('connect-status-sub').textContent = 'Reaching your Mac over the tailnet.';
    document.getElementById('connect-check').classList.add('hidden');
    document.getElementById('btn-setup-next').textContent = 'Please wait\u2026';
    document.getElementById('btn-setup-next').disabled = true;
    const res = await pingMac(pendingMac);
    document.getElementById('btn-setup-next').disabled = false;
    if (res.online){
      document.getElementById('connect-status-h').textContent = 'Connected';
      document.getElementById('connect-status-sub').textContent = 'This device is connected directly to your Mac.';
      document.getElementById('connect-check').classList.remove('hidden');
    } else {
      document.getElementById('connect-status-h').textContent = 'Couldn\u2019t connect';
      document.getElementById('connect-status-sub').textContent = 'Check the address and make sure Ollama and Tailscale are running on the Mac. You can still save it and retry later.';
    }
    document.getElementById('btn-setup-next').textContent = 'Done';
  } else {
    const macs = store.macs;
    macs.push(pendingMac);
    store.macs = macs;
    logActivity(`Added \u201c${pendingMac.name}\u201d`);
    showTab('home');
  }
});

// ---------- DEVICE DETAIL ----------
let currentDeviceIdx = null;
async function openDevice(idx){
  currentDeviceIdx = idx;
  const m = store.macs[idx];
  document.getElementById('device-title').textContent = m.name;
  document.getElementById('device-name-lg').textContent = m.name;
  document.getElementById('device-host').textContent = m.host;
  document.getElementById('tabbar').classList.add('hidden');
  showScreen('device');

  document.getElementById('stat-runtime-sub').textContent = 'Checking\u2026';
  document.getElementById('stat-runtime-val').textContent = '\u2014';
  document.getElementById('stat-models-val').textContent = '\u2014';
  document.getElementById('available-models').innerHTML = '';
  document.getElementById('installed-models').innerHTML = '';

  const res = await pingMac(m);
  if (res.online){
    document.getElementById('stat-runtime-sub').textContent = 'Reachable over Tailscale';
    document.getElementById('stat-runtime-val').textContent = 'Healthy';
    const installed = res.models.map(x => x.name);
    document.getElementById('stat-model-sub').textContent = installed.length ? installed[0] : 'No active model';
    document.getElementById('stat-model-val').textContent = installed.length ? 'Ready' : 'Idle';
    document.getElementById('stat-models-sub').textContent = `${installed.length} on this Mac`;
    document.getElementById('stat-models-val').textContent = `${installed.length} installed`;
    document.getElementById('stat-mem-sub').textContent = 'Reported by Ollama at request time';

    document.getElementById('installed-models').innerHTML = installed.length ? res.models.map(mo => `
      <div class="model-card">
        <div class="m-name">${escapeHtml(mo.name)}</div>
        <div class="m-meta">${mo.size ? (mo.size/1e9).toFixed(1)+'GB' : ''}</div>
      </div>`).join('') : '<div class="simple-row"><span class="dim">No models installed yet</span></div>';

    document.getElementById('available-models').innerHTML = CURATED_MODELS.map(cm => `
      <div class="model-card">
        <div class="m-name">${cm.name}</div>
        <div class="m-desc">${cm.desc}</div>
        <div class="m-meta">Available to download \u00b7 ${cm.size}</div>
        <button class="m-btn" data-model="${cm.name}">Download</button>
      </div>`).join('');

    document.getElementById('available-models').querySelectorAll('.m-btn').forEach(btn=>{
      btn.addEventListener('click', ()=> pullModel(m, btn));
    });
  } else {
    document.getElementById('stat-runtime-sub').textContent = 'Unreachable';
    document.getElementById('stat-runtime-val').textContent = 'Offline';
    document.getElementById('stat-model-sub').textContent = '\u2014';
    document.getElementById('stat-models-sub').textContent = '\u2014';
    document.getElementById('stat-mem-sub').textContent = '\u2014';
  }
}

async function pullModel(mac, btn){
  btn.disabled = true;
  btn.textContent = 'Downloading\u2026';
  try{
    const r = await fetch(ollamaUrl(mac.host, '/api/pull'), {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name: btn.dataset.model, stream:false })
    });
    if (!r.ok) throw new Error('pull failed');
    btn.textContent = 'Installed';
    btn.classList.add('installed');
    logActivity(`Downloaded \u201c${btn.dataset.model}\u201d on ${mac.name}`);
  }catch(e){
    btn.textContent = 'Retry';
    btn.disabled = false;
  }
}

document.getElementById('btn-back-home').addEventListener('click', ()=> showTab('home'));
document.getElementById('btn-refresh').addEventListener('click', ()=> { if (currentDeviceIdx !== null) openDevice(currentDeviceIdx); });

// ---------- CHATS ----------
function renderChatsList(){
  const chats = store.chats;
  const empty = document.getElementById('chats-empty');
  const list = document.getElementById('chats-list');
  if (chats.length === 0){
    empty.classList.remove('hidden'); list.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden'); list.classList.remove('hidden');
  list.innerHTML = chats.map((c,i)=>`
    <div class="mac-row" data-idx="${i}">
      <div class="thumb">${macThumbSvg()}</div>
      <div class="meta">
        <div class="name">${escapeHtml(c.model)}</div>
        <div class="status-line"><span class="badge-dot" style="background:#8e8e93"></span> ${escapeHtml((c.messages[c.messages.length-1]||{}).content || 'New chat').slice(0,40)}</div>
      </div>
    </div>`).join('');
  list.querySelectorAll('.mac-row').forEach(row=>{
    row.addEventListener('click', ()=> openChat(parseInt(row.dataset.idx)));
  });
}
document.getElementById('btn-new-chat').addEventListener('click', newChatFlow);
document.getElementById('btn-new-chat-2').addEventListener('click', newChatFlow);

function newChatFlow(){
  const macs = store.macs;
  if (macs.length === 0){ startAddFlow(); return; }
  const mac = macs[0]; // default to first Mac; picker handled in chat header
  const chats = store.chats;
  chats.push({ macIdx:0, model: mac.defaultModel || 'llama3.2', messages: [] });
  store.chats = chats;
  openChat(chats.length - 1);
}

let currentChatIdx = null;
function openChat(idx){
  currentChatIdx = idx;
  const c = store.chats[idx];
  document.getElementById('chat-model-label').textContent = c.model;
  document.getElementById('tabbar').classList.add('hidden');
  showScreen('chat');
  renderMessages();
}
function renderMessages(){
  const c = store.chats[currentChatIdx];
  const wrap = document.getElementById('chat-messages');
  wrap.innerHTML = c.messages.map(m => `<div class="msg ${m.role}">${escapeHtml(m.content)}</div>`).join('');
  wrap.scrollTop = wrap.scrollHeight;
}
document.getElementById('btn-chat-back').addEventListener('click', ()=> showTab('chats'));

document.getElementById('btn-model-picker').addEventListener('click', ()=>{
  const name = prompt('Model name (as installed on your Mac):', store.chats[currentChatIdx].model);
  if (name){
    const chats = store.chats;
    chats[currentChatIdx].model = name;
    store.chats = chats;
    document.getElementById('chat-model-label').textContent = name;
  }
});

async function sendMessage(){
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || currentChatIdx === null) return;
  input.value = '';
  const chats = store.chats;
  const c = chats[currentChatIdx];
  const mac = store.macs[c.macIdx];
  c.messages.push({ role:'user', content:text });
  c.messages.push({ role:'assistant', content:'' });
  store.chats = chats;
  renderMessages();

  if (!mac){
    c.messages[c.messages.length-1].content = 'No Mac connected. Add one from the Home tab first.';
    store.chats = chats; renderMessages();
    return;
  }

  try{
    const r = await fetch(ollamaUrl(mac.host, '/api/chat'), {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        model: c.model,
        messages: c.messages.slice(0,-1).map(m=>({role:m.role, content:m.content})),
        stream: true
      })
    });
    if (!r.ok || !r.body) throw new Error('chat request failed');
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while(true){
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream:true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines){
        if (!line.trim()) continue;
        try{
          const j = JSON.parse(line);
          if (j.message && j.message.content){
            c.messages[c.messages.length-1].content += j.message.content;
            renderMessages();
          }
        }catch(e){}
      }
    }
    store.chats = chats;
  }catch(e){
    c.messages[c.messages.length-1].content = 'Couldn\u2019t reach the model. Check the Mac is online and the model name is correct.';
    store.chats = chats;
    renderMessages();
  }
}
document.getElementById('btn-send').addEventListener('click', sendMessage);
document.getElementById('chat-input').addEventListener('keydown', e=>{
  if (e.key === 'Enter'){ e.preventDefault(); sendMessage(); }
});

// ---------- ACTIVITY ----------
function renderActivity(){
  const a = store.activity;
  const list = document.getElementById('activity-list');
  const empty = document.getElementById('activity-empty');
  if (a.length === 0){ list.innerHTML=''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  list.innerHTML = a.map(item => `
    <div class="simple-row">
      <span>${escapeHtml(item.text)}</span>
      <span class="dim">${timeAgo(item.time)}</span>
    </div>`).join('');
}

// ---------- MORE ----------
function renderMore(){
  const macs = store.macs;
  const list = document.getElementById('more-mac-list');
  list.innerHTML = macs.length ? macs.map((m,i)=>`
    <div class="simple-row" data-idx="${i}" style="cursor:pointer">
      <span>${escapeHtml(m.name)}</span>
      <span class="dim">${escapeHtml(m.host)}</span>
    </div>`).join('') : '<div class="simple-row"><span class="dim">No Macs added yet</span></div>';
  list.querySelectorAll('.simple-row[data-idx]').forEach(row=>{
    row.addEventListener('click', ()=> openDevice(parseInt(row.dataset.idx)));
  });
}

// ---------- init ----------
showTab('home');
