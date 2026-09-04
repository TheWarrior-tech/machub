// Capacitor auto-registers installed native plugins on window.Capacitor.Plugins
// at runtime. No bundler here, so we call it directly rather than importing
// the npm wrapper package (which wouldn't resolve as a bare specifier in a
// plain <script> tag). Falls back to a silent no-op in a regular browser tab.
function haptics(){ return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) || null; }
function hapticLight(){ const h = haptics(); if (h) h.impact({ style:'LIGHT' }).catch(()=>{}); }
function hapticSuccess(){ const h = haptics(); if (h) h.notification({ type:'SUCCESS' }).catch(()=>{}); }
function hapticError(){ const h = haptics(); if (h) h.notification({ type:'ERROR' }).catch(()=>{}); }

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
  btn.addEventListener('click', ()=> { hapticLight(); showTab(btn.dataset.tab); });
});

// ---------- Ollama API helpers ----------
function ollamaUrl(host, path){
  let h = host.trim();
  if (!h.includes(':')) h += ':11434';
  if (!h.startsWith('http')) h = 'http://' + h;
  return h.replace(/\/$/,'') + path;
}
async function pingMac(mac){
  const url = ollamaUrl(mac.host, '/api/tags');
  try{
    const r = await fetch(url, { method:'GET' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    return { online:true, models: data.models || [], reason:null, detail:null };
  }catch(e){
    const firstError = (e && e.message) ? e.message : String(e);
    // The normal request failed. Probe again with no-cors: this succeeds
    // (without throwing) as long as the host:port is actually reachable,
    // even if the response itself is blocked by CORS. That lets us tell
    // "wrong IP/port/offline" apart from "reachable, but Ollama is
    // rejecting this origin" \u2014 two very different fixes.
    try{
      await fetch(url, { method:'GET', mode:'no-cors' });
      return { online:false, models: [], reason:'blocked', detail:firstError };
    }catch(e2){
      const secondError = (e2 && e2.message) ? e2.message : String(e2);
      return { online:false, models: [], reason:'unreachable', detail: firstError + ' / ' + secondError };
    }
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
  return `<img src="mac-studio.png" alt="Mac Studio" />`;
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
      el.innerHTML = '<span class="badge-dot"></span> Connected';
    } else if (res.reason === 'blocked'){
      el.className = 'status-line offline';
      el.innerHTML = '<span class="badge-dot" style="background:#ff9f0a"></span> Blocked (check OLLAMA_ORIGINS)';
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
    document.getElementById('connect-status-sub').textContent = 'Reaching Ollama at that address.';
    document.getElementById('connect-check').classList.add('hidden');
    document.getElementById('btn-setup-next').textContent = 'Please wait\u2026';
    document.getElementById('btn-setup-next').disabled = true;
    const res = await pingMac(pendingMac);
    document.getElementById('btn-setup-next').disabled = false;
    if (res.online){
      document.getElementById('connect-status-h').textContent = 'Connected';
      document.getElementById('connect-status-sub').textContent = 'This device is connected directly to your Mac.';
      document.getElementById('connect-check').classList.remove('hidden');
      document.getElementById('connect-error-detail').classList.add('hidden');
      hapticSuccess();
    } else if (res.reason === 'blocked'){
      document.getElementById('connect-status-h').textContent = 'Reachable, but blocked';
      document.getElementById('connect-status-sub').textContent = 'The address responds, but Ollama is rejecting requests from this app. On the Mac, restart Ollama with OLLAMA_ORIGINS=* set, then retry. You can still save it and retry later.';
      document.getElementById('connect-error-detail').textContent = res.detail || '';
      document.getElementById('connect-error-detail').classList.remove('hidden');
      hapticError();
    } else {
      document.getElementById('connect-status-h').textContent = 'Couldn\u2019t connect';
      document.getElementById('connect-status-sub').textContent = 'Check the address and port, and make sure Ollama is running with OLLAMA_HOST=0.0.0.0 on the Mac. You can still save it and retry later.';
      document.getElementById('connect-error-detail').textContent = res.detail || '';
      document.getElementById('connect-error-detail').classList.remove('hidden');
      hapticError();
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
  document.getElementById('device-error-detail').classList.add('hidden');
  if (res.online){
    document.getElementById('stat-runtime-sub').textContent = 'Reachable';
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

    const availableToShow = CURATED_MODELS.filter(cm => !installed.some(name => name.startsWith(cm.name)));
    document.getElementById('available-models').innerHTML = availableToShow.length ? availableToShow.map(cm => `
      <div class="model-card">
        <div class="m-name">${cm.name}</div>
        <div class="m-desc">${cm.desc}</div>
        <div class="m-meta">Available to download \u00b7 ${cm.size}</div>
        <button class="m-btn" data-model="${cm.name}">Download</button>
        <div class="dl-progress-track hidden"><div class="dl-progress-fill"></div></div>
      </div>`).join('') : '<div class="simple-row"><span class="dim">All suggested models installed</span></div>';

    document.getElementById('available-models').querySelectorAll('.m-btn').forEach(btn=>{
      btn.addEventListener('click', ()=> pullModel(m, btn));
    });
  } else {
    document.getElementById('stat-runtime-sub').textContent = res.reason === 'blocked' ? 'Blocked (CORS)' : 'Unreachable';
    document.getElementById('stat-runtime-val').textContent = 'Offline';
    document.getElementById('stat-model-sub').textContent = '\u2014';
    document.getElementById('stat-models-sub').textContent = '\u2014';
    document.getElementById('stat-mem-sub').textContent = '\u2014';
    const errBox = document.getElementById('device-error-detail');
    errBox.textContent = (res.reason === 'blocked'
      ? 'Reachable, but Ollama is rejecting this app\u2019s requests. Restart it on the Mac with OLLAMA_ORIGINS=* set. \u2014 '
      : 'Couldn\u2019t reach this address. Check it\u2019s correct and Ollama is running with OLLAMA_HOST=0.0.0.0. \u2014 '
    ) + (res.detail || '');
    errBox.classList.remove('hidden');
  }
}

async function pullModel(mac, btn){
  btn.disabled = true;
  const track = btn.nextElementSibling; // .dl-progress-track
  const fill = track ? track.querySelector('.dl-progress-fill') : null;
  if (track) track.classList.remove('hidden');
  btn.textContent = 'Starting\u2026';
  try{
    const r = await fetch(ollamaUrl(mac.host, '/api/pull'), {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name: btn.dataset.model, stream:true })
    });
    if (!r.ok || !r.body) throw new Error('pull failed');
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let lastPct = 0;
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
          if (j.error) throw new Error(j.error);
          if (j.total && j.completed){
            lastPct = Math.round((j.completed / j.total) * 100);
            if (fill) fill.style.width = lastPct + '%';
            btn.textContent = (j.status || 'Downloading') + ' \u00b7 ' + lastPct + '%';
          } else if (j.status){
            btn.textContent = j.status;
          }
        }catch(parseErr){
          if (parseErr instanceof SyntaxError) continue; // partial line, ignore
          throw parseErr;
        }
      }
    }
    btn.textContent = 'Installed';
    btn.classList.add('installed');
    if (fill) fill.style.width = '100%';
    logActivity(`Downloaded \u201c${btn.dataset.model}\u201d on ${mac.name}`);
    hapticSuccess();
    // Refresh the whole screen so the model moves into "Installed"
    if (currentDeviceIdx !== null) openDevice(currentDeviceIdx);
  }catch(e){
    btn.textContent = 'Retry';
    btn.disabled = false;
    if (track) track.classList.add('hidden');
    hapticError();
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
        <div class="name">${escapeHtml(c.model || 'New chat')}</div>
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
  const chats = store.chats;
  chats.push({ macIdx:0, model: null, messages: [] });
  store.chats = chats;
  openChat(chats.length - 1);
  if (!chats[chats.length - 1].model) openModelSheet();
}

let currentChatIdx = null;
function openChat(idx){
  currentChatIdx = idx;
  const c = store.chats[idx];
  document.getElementById('chat-model-label').textContent = c.model || 'Select a model';
  document.getElementById('tabbar').classList.add('hidden');
  showScreen('chat');
  renderMessages();
}
let isStreaming = false;
function renderMessages(){
  const c = store.chats[currentChatIdx];
  const wrap = document.getElementById('chat-messages');
  wrap.innerHTML = c.messages.map((m, i) => {
    const isLast = i === c.messages.length - 1;
    const cursor = (isStreaming && isLast && m.role === 'assistant') ? '<span class="typing-cursor"></span>' : '';
    return `<div class="msg ${m.role}">${escapeHtml(m.content)}${cursor}</div>`;
  }).join('');
  wrap.scrollTop = wrap.scrollHeight;
}
document.getElementById('btn-chat-back').addEventListener('click', ()=> showTab('chats'));

document.getElementById('btn-model-picker').addEventListener('click', openModelSheet);
document.getElementById('model-sheet-backdrop').addEventListener('click', (e)=>{
  if (e.target.id === 'model-sheet-backdrop') closeModelSheet();
});

function closeModelSheet(){
  document.getElementById('model-sheet-backdrop').classList.add('hidden');
}

async function openModelSheet(){
  const c = store.chats[currentChatIdx];
  const mac = store.macs[c.macIdx];
  const backdrop = document.getElementById('model-sheet-backdrop');
  const list = document.getElementById('model-sheet-list');
  const sub = document.getElementById('model-sheet-sub');
  backdrop.classList.remove('hidden');
  hapticLight();

  if (!mac){
    sub.textContent = 'No Mac connected';
    list.innerHTML = '<div class="sheet-empty">Add a Mac from the Home tab first.</div>';
    return;
  }
  sub.textContent = mac.name;
  list.innerHTML = '<div class="sheet-empty">Loading models\u2026</div>';

  const res = await pingMac(mac);
  if (!res.online){
    list.innerHTML = '<div class="sheet-empty">Can\u2019t reach this Mac right now \u2014 check the connection on the device screen.</div>';
    return;
  }
  if (res.models.length === 0){
    list.innerHTML = '<div class="sheet-empty">No models installed yet. Go to the device screen to download one.</div>';
    return;
  }
  list.innerHTML = res.models.map(m => `
    <div class="sheet-row ${m.name === c.model ? 'selected' : ''}" data-name="${escapeHtml(m.name)}">
      <div>
        <div class="sr-name">${escapeHtml(m.name)}</div>
        <div class="sr-meta">${m.size ? (m.size/1e9).toFixed(1)+'GB' : ''}</div>
      </div>
      <svg class="sr-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
    </div>`).join('');

  list.querySelectorAll('.sheet-row').forEach(row=>{
    row.addEventListener('click', ()=>{
      const name = row.dataset.name;
      const chats = store.chats;
      chats[currentChatIdx].model = name;
      store.chats = chats;
      document.getElementById('chat-model-label').textContent = name;
      hapticLight();
      closeModelSheet();
    });
  });
}

async function sendMessage(){
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || currentChatIdx === null) return;
  const chats0 = store.chats;
  const c0 = chats0[currentChatIdx];
  if (!c0.model){
    openModelSheet();
    return;
  }
  input.value = '';
  const sendBtn = document.getElementById('btn-send');
  sendBtn.disabled = true;
  hapticLight();

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
    sendBtn.disabled = false;
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
    isStreaming = true;
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
    c.messages[c.messages.length-1].content = 'Couldn\u2019t reach the model. Check the Mac is online and try again.';
    store.chats = chats;
    renderMessages();
    hapticError();
  }
  isStreaming = false;
  renderMessages();
  sendBtn.disabled = false;
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
