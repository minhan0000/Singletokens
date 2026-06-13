/* ══════════════════════════════════════════
   MARKED.JS KONFIGURATION
══════════════════════════════════════════ */
if (typeof marked !== 'undefined') {
  marked.setOptions({ breaks: true, gfm: true });
}
function escHtmlFallback(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function renderMarkdown(t) {
  if (typeof marked === 'undefined') return escHtmlFallback(t);
  try {
    const raw = marked.parse(t);
    return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(raw) : escHtmlFallback(t);
  } catch(e) { return escHtmlFallback(t); }
}

/* ══════════════════════════════════════════
   CUSTOM SELECT COMPONENT
══════════════════════════════════════════ */
const MODEL_META = {
  'Llama 3.3 70B':   { icon:'🦙', color:'#22D3EE' },
  'Llama 3.1 8B':    { icon:'🦙', color:'#22D3EE' },
  'Gemma 2 9B':      { icon:'💎', color:'#34D399' },
  'Mixtral 8x7B':    { icon:'🌀', color:'#A78BFA' },
  'DeepSeek R1 70B': { icon:'🔍', color:'#60A5FA' },
  'DeepSeek V3':     { icon:'🔍', color:'#60A5FA' },
  'Claude Sonnet 4.5':{ icon:'◆', color:'#F97316' },
  'Claude Opus 4.5': { icon:'◆', color:'#F97316' },
  'Claude Haiku 4.5':{ icon:'◆', color:'#F97316' },
  'GPT-4o':          { icon:'⬡', color:'#4ADE80' },
  'GPT-5':           { icon:'⬡', color:'#4ADE80' },
  'GPT-4 Turbo':     { icon:'⬡', color:'#4ADE80' },
  'Gemini 2.0 Flash':{ icon:'✦', color:'#FBBF24' },
  'Gemini Pro 2.0':  { icon:'✦', color:'#FBBF24' },
  'Grok 2':          { icon:'✕', color:'#E5E7EB' },
  'Mistral Large 2': { icon:'▲', color:'#F472B6' },
  'Mistral Small':   { icon:'▲', color:'#F472B6' },
};

const CHEVRON_SVG = `<svg class="csel-chev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>`;
const _cselInstances = [];

class CustomSelect {
  constructor(selectEl, targetWrap, opts = {}) {
    this.select = selectEl;
    this.targetWrap = targetWrap;
    this.isModel = opts.isModel || false;
    this.width = opts.width || null;
    this.alignLeft = opts.alignLeft || false;
    this.build();
    _cselInstances.push(this);
  }
  build() {
    this.wrap = document.createElement('div');
    this.wrap.className = 'csel-wrap' + (this.isModel ? ' csel-model-wrap' : '');
    if (this.width) this.wrap.style.width = this.width;
    this.trigger = document.createElement('button');
    this.trigger.type = 'button';
    this.trigger.className = 'csel-trigger';
    if (this.isModel) { this.iconEl = document.createElement('span'); this.iconEl.className = 'csel-model-icon'; this.trigger.appendChild(this.iconEl); }
    this.valEl = document.createElement('span');
    this.valEl.className = 'csel-val';
    this.trigger.appendChild(this.valEl);
    this.trigger.insertAdjacentHTML('beforeend', CHEVRON_SVG);
    this.panel = document.createElement('div');
    this.panel.className = 'csel-panel';
    if (this.alignLeft) this.panel.style.left = '0';
    else this.panel.style.right = '0';
    this.buildOptions();
    this.wrap.appendChild(this.trigger);
    this.wrap.appendChild(this.panel);
    this.targetWrap.appendChild(this.wrap);
    this.syncDisplay();
    this.trigger.addEventListener('click', e => { e.stopPropagation(); this.toggle(); });
    this.trigger.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggle(); } });
  }
  buildOptions() {
    this.panel.innerHTML = '';
    const opts = [...this.select.options];
    opts.forEach((opt, i) => {
      if (this.isModel && i > 0 && !this._sameGroup(opts[i-1], opt)) { const sep = document.createElement('div'); sep.className = 'csel-sep'; this.panel.appendChild(sep); }
      const div = document.createElement('div');
      div.className = 'csel-opt' + (opt.selected ? ' active' : '');
      div.dataset.value = opt.value;
      if (opt.dataset.t) div.dataset.t = opt.dataset.t;
      const dot = document.createElement('span'); dot.className = 'csel-dot'; div.appendChild(dot);
      if (this.isModel) { const meta = MODEL_META[opt.value]; if (meta) { const icon = document.createElement('span'); icon.style.cssText = `font-size:11px;width:18px;text-align:center;flex-shrink:0;color:${meta.color}`; icon.textContent = meta.icon; div.appendChild(icon); } }
      const label = document.createElement('span'); label.textContent = opt.textContent; div.appendChild(label);
      div.addEventListener('click', e => { e.stopPropagation(); this.setValue(opt.value); this.close(); });
      this.panel.appendChild(div);
    });
  }
  _sameGroup(a, b) {
    const groups = { anthropic: ['Claude Sonnet 4.5','Claude Opus 4.5','Claude Haiku 4.5'], openai: ['GPT-4o','GPT-5','GPT-4 Turbo','OpenAI o1','OpenAI o1 Mini'], google: ['Gemini 2.0 Flash','Gemini Pro 2.0'] };
    for (const g of Object.values(groups)) { if (g.includes(a.value) && g.includes(b.value)) return true; }
    return false;
  }
  syncDisplay() {
    const selected = this.select.options[this.select.selectedIndex];
    if (!selected) return;
    this.valEl.textContent = selected.textContent;
    if (this.isModel && this.iconEl) { const meta = MODEL_META[selected.value]; if (meta) { this.iconEl.textContent = meta.icon; this.iconEl.style.color = meta.color; this.iconEl.style.background = meta.color + '22'; } }
    this.panel.querySelectorAll('.csel-opt').forEach(d => { d.classList.toggle('active', d.dataset.value === this.select.value); });
  }
  setValue(val) { this.select.value = val; this.select.dispatchEvent(new Event('change')); this.syncDisplay(); }
  toggle() { const isOpen = this.panel.classList.contains('open'); _closeAllCsel(); if (!isOpen) this.open(); }
  open() { const trigRect = this.trigger.getBoundingClientRect(); const spaceBelow = window.innerHeight - trigRect.bottom; if (spaceBelow < 200) this.panel.classList.add('drop-up'); else this.panel.classList.remove('drop-up'); this.panel.classList.add('open'); this.trigger.classList.add('open'); }
  close() { this.panel.classList.remove('open'); this.trigger.classList.remove('open'); }
  refresh() { [...this.select.options].forEach(opt => { const div = this.panel.querySelector(`.csel-opt[data-value="${CSS.escape(opt.value)}"]`); if (div) { const spans = div.querySelectorAll('span:not(.csel-dot)'); const labelSpan = spans[spans.length - 1]; if (labelSpan) labelSpan.textContent = opt.textContent; } }); this.syncDisplay(); }
}

function _closeAllCsel() { _cselInstances.forEach(cs => cs.close()); }
document.addEventListener('click', _closeAllCsel);
document.addEventListener('keydown', e => { if (e.key === 'Escape') _closeAllCsel(); });

function initCustomSelects() {
  const chatModelSel = document.getElementById('chat-model-sel');
  const chatModelWrap = document.getElementById('chat-model-sel-wrap');
  if (chatModelSel && chatModelWrap) window._chatModelCsel = new CustomSelect(chatModelSel, chatModelWrap, { isModel: true, alignLeft: true });
  const langSel = document.getElementById('lang-sel');
  const langWrap = document.getElementById('lang-sel-wrap');
  if (langSel && langWrap) window._langCsel = new CustomSelect(langSel, langWrap, { width: '130px' });
  const defModelSel = document.getElementById('default-model-sel');
  const defModelWrap = document.getElementById('default-model-sel-wrap');
  if (defModelSel && defModelWrap) new CustomSelect(defModelSel, defModelWrap, { isModel: true });
  const themeSel = document.getElementById('theme-sel');
  const themeWrap = document.getElementById('theme-sel-wrap');
  if (themeSel && themeWrap) new CustomSelect(themeSel, themeWrap, { width: '110px' });
  const fontSel = document.getElementById('fontsize-sel');
  const fontWrap = document.getElementById('fontsize-sel-wrap');
  if (fontSel && fontWrap) new CustomSelect(fontSel, fontWrap, { width: '100px' });
  const gptModelSel = document.getElementById('gpt-model');
  const gptModelWrap = document.getElementById('gpt-model-sel-wrap');
  if (gptModelSel && gptModelWrap) window._gptModelCsel = new CustomSelect(gptModelSel, gptModelWrap, { isModel: true, alignLeft: true, width: '100%' });
}

/* ═══ CONFIRM MODAL ═══ */
let _confirmCallback = null;
function showConfirm(opts) {
  document.getElementById("confirm-title").textContent = opts.title || "Bestätigen";
  document.getElementById("confirm-msg").textContent = opts.msg || "";
  document.getElementById("confirm-ok-btn").textContent = opts.okLabel || "OK";
  _confirmCallback = opts.onOk || null;
  document.getElementById("confirm-modal").classList.add("is-open");
}
function _confirmOk() { document.getElementById("confirm-modal").classList.remove("is-open"); if (typeof _confirmCallback === "function") _confirmCallback(); _confirmCallback = null; }
function _confirmCancel() { document.getElementById("confirm-modal").classList.remove("is-open"); _confirmCallback = null; }
document.addEventListener("keydown", function(e) { if (e.key === "Escape" && document.getElementById("confirm-modal").classList.contains("is-open")) _confirmCancel(); });

/* ─── SIDEBAR ─── */
function toggleSidebar() { const sb = document.getElementById('sidebar'); sb.classList.toggle('collapsed'); localStorage.setItem('sidebarCollapsed', sb.classList.contains('collapsed')); }
(function(){ if (localStorage.getItem('sidebarCollapsed') === 'true') { const sb = document.getElementById('sidebar'); if (sb) sb.classList.add('collapsed'); } })();

/* ─── NAVIGATION ─── */
let lastView = 'chat', currentView = 'chat';
function openView(id) {
  if (id === 'settings' && currentView === 'settings') { id = lastView; }
  else { if (currentView !== 'settings') lastView = currentView; }
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (id === 'models') document.getElementById('nav-models').classList.add('active');
  if (id === 'purchase') document.getElementById('nav-purchase').classList.add('active');
  if (id === 'gpts') document.getElementById('nav-gpts').classList.add('active');
  currentView = id;
}

/* ─── CHAT CORE ─── */
let balance = 0;
const MODELS_MULT = {
  'Llama 3.3 70B':0.3,'Llama 11B':0.13,'Llama 3.2 Vision 11B':0.3,
  'Claude Haiku 4.5':0.27,'Claude Sonnet 4.5':1,'Claude 3.7 Sonnet':2,'Claude Opus 4.5':5,
  'GPT-4o':0.85,'GPT-5':2,'OpenAI o1':5,'OpenAI o1 Mini':0.5,
  'Gemini 2.5 Pro':0.5,'Gemini Pro 2.0':0.3,'Gemini Flash 2.0':0.08,
  'Mistral Large 2':0.7,'Mistral Small':0.12,'DeepSeek V3':0.15,
  'Qwen 2.5 72B':0.15,'Grok 2':0.5,'Perplexity Sonar Pro':1.5,
  'Command R+':0.3,'Phi-4 Mini':0.05,'Amazon Nova Lite':0.05,'Gemma 2 27B':0.1,
  'Flux 1.1 Pro':3,'DALL·E 3':6,'Stable Diffusion 3.5':2,'Ideogram 2.0':4,
  'Multilingual v2':2.5,'Whisper Large v3':0.5
};
function fmtBalance() { if (balance >= 1000000) return (balance/1000000).toFixed(1).replace(/\.0$/,'')+'M'; if (balance >= 1000) return Math.round(balance/1000)+'K'; return balance.toString(); }
const fmtBal = fmtBalance;
function updateBalance(used) {
  balance = Math.max(0, balance - used);
  const el = document.getElementById('token-counter');
  const badge = document.getElementById('s-tok-badge');
  if (el) el.textContent = fmtBalance() + ' Tokens';
  if (badge) badge.textContent = fmtBalance() + ' Tokens';
}
var sendMessage = function(){ console.warn('api.js noch nicht geladen'); };

function _hideWelcome() {
  const ws = document.getElementById('welcome-screen');
  if (ws) ws.style.display = 'none';
}
function _showWelcome() {
  const ws = document.getElementById('welcome-screen');
  if (ws) ws.style.display = '';
}

function addMsg(text, role, model) {
  _hideWelcome();
  const msgs = document.getElementById('chat-messages');
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  const m = document.getElementById('chat-model-sel').value;
  const rendered = role === 'ai' ? renderMarkdown(text) : escHtml(text);
  d.innerHTML = `<div class="msg-bubble">${rendered}</div><div class="msg-meta">${role === 'user' ? 'Du' : escHtml(model || m)}</div>`;
  d.style.animation = 'msgIn .3s ease both';
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

function addTyping() {
  const msgs = document.getElementById('chat-messages');
  const d = document.createElement('div');
  d.className = 'msg ai';
  d.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}
function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function autoResize(el) { el.style.height = '22px'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }

/* ═══ CHAT HISTORY ═══ */
let savedChats = JSON.parse(localStorage.getItem('st_chats') || '[]');
let activeChatId = null;
let ctxTargetId = null;
function genId() { const a=new Uint32Array(2);crypto.getRandomValues(a);return Date.now().toString(36)+a[0].toString(36)+a[1].toString(36); }
function persistChats() { localStorage.setItem('st_chats', JSON.stringify(savedChats.slice(0,50))); }

function _getCurrentUserName() {
  const cached = JSON.parse(localStorage.getItem('st_user') || 'null');
  return cached?.name || 'dort';
}

function newChat() {
  saveCurrentChat();
  activeChatId = null;
  const msgs = document.getElementById('chat-messages');
  msgs.innerHTML = '';
  // Restore welcome screen
  const ws = document.createElement('div'); ws.id = 'welcome-screen';
  const wg = document.createElement('div'); wg.id = 'welcome-greeting'; wg.textContent = _getWelcomeGreeting(); ws.appendChild(wg);
  const wsub = document.createElement('div'); wsub.id = 'welcome-sub'; wsub.textContent = 'Wie kann ich dir heute helfen?'; ws.appendChild(wsub);
  msgs.appendChild(ws);
  if (typeof resetChatHistory === 'function') resetChatHistory();
  renderChatHistory();
}

function _getWelcomeGreeting() {
  const cached = JSON.parse(localStorage.getItem('st_user') || 'null');
  const n = cached?.name || null;
  const h = new Date().getHours();
  const rnd = arr => arr[Math.floor(Math.random() * arr.length)];

  const morning = n ? [
    'Guten Morgen, ' + n + '! Womit kann ich dir heute helfen?',
    'Moin, ' + n + '! Was steht heute an?',
    'Hey ' + n + ', schön dass du da bist!',
    'Guten Morgen, ' + n + '. Frisch in den Tag gestartet?',
    'Rise and shine, ' + n + '! Was kann ich für dich tun?',
  ] : [
    'Guten Morgen! Womit kann ich dir helfen?',
    'Moin! Was steht heute an?',
    'Guten Morgen – schön, dass du da bist!',
  ];

  const day = n ? [
    'Schön, dich zu sehen, ' + n + '.',
    'Hey ' + n + '! Was kann ich heute für dich tun?',
    'Hallo ' + n + '! Womit darf ich dich unterstützen?',
    'Na ' + n + ', was gibt\'s? Ich bin bereit.',
    'Hi ' + n + '! Stell mir eine Frage oder gib mir eine Aufgabe.',
    'Guten Tag, ' + n + '. Wie kann ich helfen?',
  ] : [
    'Schön, dich zu sehen.',
    'Wie kann ich dir helfen?',
    'Hallo! Was darf ich für dich tun?',
    'Stell mir eine Frage oder gib mir eine Aufgabe.',
  ];

  const evening = n ? [
    'Guten Abend, ' + n + '! Noch was erledigen?',
    'Hey ' + n + ', langer Tag? Ich helfe gerne.',
    'Abend, ' + n + '! Was kann ich für dich tun?',
    'Guten Abend, ' + n + '. Womit darf ich dir noch helfen?',
    'Na ' + n + ', wie war dein Tag? Ich bin für dich da.',
  ] : [
    'Guten Abend! Noch was erledigen?',
    'Abend! Womit kann ich helfen?',
    'Guten Abend – wie kann ich dir behilflich sein?',
  ];

  const night = n ? [
    'Noch so spät wach, ' + n + '? Ich bin hier.',
    'Hey ' + n + ', Nachtschicht? Ich helf dir.',
    'Auch um diese Zeit bin ich für dich da, ' + n + '!',
    'Schläfst du nicht, ' + n + '? Na gut, lass uns arbeiten.',
    'Nacht ' + n + '! Was beschäftigt dich gerade?',
  ] : [
    'Noch wach? Ich bin hier.',
    'Gute Nacht – oder doch nicht schlafen?',
    'Auch um diese Uhrzeit bin ich für dich da!',
  ];

  if (h >= 5 && h < 11)       return rnd(morning);
  else if (h >= 11 && h < 18) return rnd(day);
  else if (h >= 18 && h < 22) return rnd(evening);
  else                         return rnd(night);
}

function saveCurrentChat() {
  if (!activeChatId) return;
  const msgs = document.getElementById('chat-messages');
  const bubbles = [...msgs.querySelectorAll('.msg')].map(m => ({
    role: m.classList.contains('user') ? 'user' : 'ai',
    text: m.querySelector('.msg-bubble')?.textContent || '',
    meta: m.querySelector('.msg-meta')?.textContent || ''
  }));
  if (bubbles.length === 0) return;
  const model = document.getElementById('chat-model-sel')?.value || 'Llama 3.3 70B';
  const title = bubbles.find(b => b.role === 'user')?.text?.slice(0,40) || 'Neuer Chat';
  const idx = savedChats.findIndex(c => c.id === activeChatId);
  const existing = idx >= 0 ? savedChats[idx] : {};
  const chat = { id: activeChatId, title, model, messages: bubbles, ts: Date.now(), pinned: existing.pinned || false };
  if (idx >= 0) savedChats[idx] = chat;
  else savedChats.unshift(chat);
  persistChats();
  renderChatHistory();
}

function loadSavedChat(id) {
  const chat = savedChats.find(c => c.id === id);
  if (!chat) return;
  saveCurrentChat();
  activeChatId = id;
  openView('chat');
  const msgs = document.getElementById('chat-messages');
  msgs.innerHTML = '';
  chat.messages.forEach(m => {
    const d = document.createElement('div');
    d.className = 'msg ' + m.role;
    const rendered = m.role === 'ai' ? renderMarkdown(m.text) : escHtml(m.text);
    d.innerHTML = `<div class="msg-bubble">${rendered}</div><div class="msg-meta">${escHtml(m.meta)}</div>`;
    msgs.appendChild(d);
  });
  msgs.scrollTop = msgs.scrollHeight;
  const sel = document.getElementById('chat-model-sel');
  if (sel && chat.model) { sel.value = chat.model; if (window._chatModelCsel) window._chatModelCsel.syncDisplay(); }
  if (typeof resetChatHistory === 'function') resetChatHistory();
  renderChatHistory();
}

function onMessageComplete() { if (!activeChatId) activeChatId = genId(); saveCurrentChat(); }

function renderChatHistory() {
  const list = document.getElementById('chat-history-list');
  if (!list) return;
  if (savedChats.length === 0) { list.innerHTML = '<div style="padding:10px 16px;font-size:11px;color:var(--muted)">Noch keine Chats</div>'; return; }
  const sorted = [...savedChats].sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0));
  list.innerHTML = sorted.map(c => `
    <div class="chat-item${c.id === activeChatId ? ' active-chat' : ''}${c.pinned ? ' pinned' : ''}"
         data-chat-id="${escHtml(c.id)}"
         data-ctx-id="${escHtml(c.id)}">
      <span class="chat-title">${escHtml(c.title)}</span>
      <button class="chat-dots-btn" data-dots-id="${escHtml(c.id)}" title="Optionen">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
        </svg>
      </button>
    </div>`).join('');
  list.querySelectorAll('[data-chat-id]').forEach(el => {
    el.addEventListener('click', () => loadSavedChat(el.dataset.chatId));
    el.addEventListener('contextmenu', e => openCtxMenu(e, el.dataset.ctxId));
  });
  list.querySelectorAll('[data-dots-id]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openCtxMenuFromBtn(e, btn.dataset.dotsId); });
  });
}

function escHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function deleteChat(id) { savedChats = savedChats.filter(c => c.id !== id); persistChats(); if (activeChatId === id) { activeChatId = null; newChat(); } renderChatHistory(); }

const ctxEl = document.getElementById('ctx-menu');

function _populateCtxMenu(id) {
  ctxTargetId = id;
  const chat = savedChats.find(c => c.id === id);
  const pinBtn = document.getElementById('ctx-pin-btn');
  if (chat?.pinned) {
    pinBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Lösen`;
    pinBtn.className = 'ctx-item ctx-accent';
  } else {
    pinBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>Anheften`;
    pinBtn.className = 'ctx-item';
  }
}

function _positionCtxMenu(x, y) {
  ctxEl.style.display = 'block';
  requestAnimationFrame(() => {
    const w = ctxEl.firstElementChild.offsetWidth || 170;
    const h = ctxEl.firstElementChild.offsetHeight || 120;
    ctxEl.style.left = Math.min(x, window.innerWidth - w - 8) + 'px';
    ctxEl.style.top  = Math.min(y, window.innerHeight - h - 8) + 'px';
  });
}

function openCtxMenu(e, id) { e.preventDefault(); e.stopPropagation(); _populateCtxMenu(id); _positionCtxMenu(e.clientX, e.clientY); }
function openCtxMenuFromBtn(e, id) { e.preventDefault(); _populateCtxMenu(id); const rect = e.currentTarget.getBoundingClientRect(); _positionCtxMenu(rect.left, rect.bottom + 4); }
function hideCtxMenu() { ctxEl.style.display = 'none'; ctxTargetId = null; }

document.addEventListener('click', e => { if (!ctxEl.contains(e.target)) hideCtxMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideCtxMenu(); });
document.addEventListener('scroll', hideCtxMenu, true);

let _renameTargetId = null;
function ctxRename() { const chat = savedChats.find(c => c.id === ctxTargetId); if (!chat) { hideCtxMenu(); return; } _renameTargetId = ctxTargetId; hideCtxMenu(); setTimeout(() => { const inp = document.getElementById('rename-input'); inp.value = chat.title; document.getElementById('rename-modal').classList.add('is-open'); inp.focus(); inp.select(); }, 80); }
function closeRenameModal() { document.getElementById('rename-modal').classList.remove('is-open'); _renameTargetId = null; }
function doRename() { const newName = document.getElementById('rename-input').value.trim(); if (!newName) return; const chat = savedChats.find(c => c.id === _renameTargetId); if (chat) { chat.title = newName; persistChats(); renderChatHistory(); showToast('✏️ Chat umbenannt'); } closeRenameModal(); }
function ctxPin() { const chat = savedChats.find(c => c.id === ctxTargetId); if (!chat) { hideCtxMenu(); return; } chat.pinned = !chat.pinned; persistChats(); renderChatHistory(); showToast(chat.pinned ? '📌 Angeheftet' : 'Gelöst'); hideCtxMenu(); }
function ctxDelete() { const chat = savedChats.find(c => c.id === ctxTargetId); const id = ctxTargetId; hideCtxMenu(); setTimeout(() => { showConfirm({ title: 'Chat löschen', msg: `<strong>"${escHtml(chat?.title || 'Chat')}"</strong> wirklich löschen?`, okLabel: 'Löschen', onOk: () => { deleteChat(id); showToast('🗑 Chat gelöscht'); } }); }, 80); }

renderChatHistory();

/* ─── YOUR MODELS ─── */
const ALL_MODELS = [
  {name:'Claude Haiku 4.5',    provider:'Anthropic',         cat:'anthropic', mult:0.27, tag:'Ultraschnell',   tagClass:'tag-cyan'},
  {name:'Claude Sonnet 4.5',   provider:'Anthropic',         cat:'anthropic', mult:1,    tag:'Empfohlen',      tagClass:'tag-blue'},
  {name:'Claude 3.7 Sonnet',   provider:'Anthropic',         cat:'anthropic', mult:2,    tag:'Thinking',       tagClass:'tag-blue', isNew:true},
  {name:'Claude Opus 4.5',     provider:'Anthropic',         cat:'anthropic', mult:5,    tag:'Leistungsstark', tagClass:'tag-blue'},
  {name:'GPT-4o',              provider:'OpenAI',            cat:'openai',    mult:0.85, tag:'Vielseitig',     tagClass:'tag-green'},
  {name:'GPT-5',               provider:'OpenAI',            cat:'openai',    mult:2,    tag:'Neuestes',       tagClass:'tag-red'},
  {name:'OpenAI o1',           provider:'OpenAI',            cat:'openai',    mult:5,    tag:'Reasoning',      tagClass:'tag-red'},
  {name:'OpenAI o1 Mini',      provider:'OpenAI',            cat:'openai',    mult:0.5,  tag:'Reasoning',      tagClass:'tag-muted'},
  {name:'Gemini 2.5 Pro',      provider:'Google',            cat:'google',    mult:0.5,  tag:'Thinking',       tagClass:'tag-blue', isNew:true},
  {name:'Gemini Pro 2.0',      provider:'Google',            cat:'google',    mult:0.3,  tag:'Multimodal',     tagClass:'tag-blue'},
  {name:'Gemini Flash 2.0',    provider:'Google',            cat:'google',    mult:0.08, tag:'Günstig',        tagClass:'tag-cyan'},
  {name:'Llama 3.3 70B',       provider:'Meta',              cat:'open',      mult:0.3,  tag:'Open Source',    tagClass:'tag-cyan'},
  {name:'Llama 11B',           provider:'Meta',              cat:'open',      mult:0.13, tag:'Kleinst',        tagClass:'tag-cyan'},
  {name:'Llama 3.2 Vision 11B',provider:'Meta',              cat:'open',      mult:0.3,  tag:'Multimodal',     tagClass:'tag-green', isNew:true},
  {name:'Mistral Large 2',     provider:'Mistral',           cat:'open',      mult:0.7,  tag:'Europäisch',     tagClass:'tag-muted'},
  {name:'Mistral Small',       provider:'Mistral',           cat:'open',      mult:0.12, tag:'Effizient',      tagClass:'tag-green'},
  {name:'DeepSeek V3',         provider:'DeepSeek',          cat:'open',      mult:0.15, tag:'Open Source',    tagClass:'tag-green'},
  {name:'Qwen 2.5 72B',        provider:'Alibaba',           cat:'open',      mult:0.15, tag:'Open Source',    tagClass:'tag-cyan'},
  {name:'Grok 2',              provider:'xAI',               cat:'open',      mult:0.5,  tag:'Von xAI',        tagClass:'tag-muted'},
  {name:'Perplexity Sonar Pro',provider:'Perplexity',        cat:'open',      mult:1.5,  tag:'Web-Suche',      tagClass:'tag-green', isNew:true},
  {name:'Command R+',          provider:'Cohere',            cat:'open',      mult:0.3,  tag:'RAG',            tagClass:'tag-green', isNew:true},
  {name:'Phi-4 Mini',          provider:'Microsoft',         cat:'open',      mult:0.05, tag:'Kompakt',        tagClass:'tag-cyan', isNew:true},
  {name:'Amazon Nova Lite',    provider:'Amazon',            cat:'open',      mult:0.05, tag:'Günstig',        tagClass:'tag-cyan', isNew:true},
  {name:'Gemma 2 27B',         provider:'Google',            cat:'open',      mult:0.1,  tag:'Open Source',    tagClass:'tag-cyan'},
  {name:'Flux 1.1 Pro',        provider:'Black Forest Labs', cat:'image',     mult:3,    tag:'Scharf',         tagClass:'tag-pink', isNew:true},
  {name:'DALL·E 3',            provider:'OpenAI',            cat:'image',     mult:6,    tag:'Kreativ',        tagClass:'tag-pink', isNew:true},
  {name:'Stable Diffusion 3.5',provider:'Stability AI',      cat:'image',     mult:2,    tag:'Open Source',    tagClass:'tag-pink', isNew:true},
  {name:'Ideogram 2.0',        provider:'Ideogram',          cat:'image',     mult:4,    tag:'Text in Bild',   tagClass:'tag-pink', isNew:true},
  {name:'Multilingual v2',     provider:'ElevenLabs',        cat:'voice',     mult:2.5,  tag:'Natürlich',      tagClass:'tag-purple', isNew:true},
  {name:'Whisper Large v3',    provider:'OpenAI',            cat:'voice',     mult:0.5,  tag:'Transkription',  tagClass:'tag-purple', isNew:true},
];
function getCardClass(m) {
  if (m.cat === 'image') return 'img-card';
  if (m.cat === 'voice') return 'voice-card';
  if (m.mult >= 2) return 'expensive';
  if (m.mult <= 0.3) return 'cheap';
  if (m.mult === 1) return 'reference';
  return '';
}
function renderModels(f) {
  const g = document.getElementById('model-grid');
  let list = f === 'all' ? ALL_MODELS : f === 'cheap' ? ALL_MODELS.filter(m => m.mult <= 0.5) : ALL_MODELS.filter(m => m.cat === f);
  g.innerHTML = list.map((m,i) => `<div class="mc ${getCardClass(m)}" data-model-name="${escHtml(m.name)}" style="animation-delay:${i*0.04}s">${m.isNew?'<div class="mc-new">NEU</div>':''}<div class="mc-provider">${escHtml(m.provider)}</div><div class="mc-name">${escHtml(m.name)}</div><div class="mc-mult">x${m.mult}</div><div class="mc-price">€${(m.mult).toFixed(2)} / 1K</div><span class="mc-tag ${m.tagClass}">${escHtml(m.tag)}</span></div>`).join('');
  g.querySelectorAll('.mc[data-model-name]').forEach(el => {
    el.addEventListener('click', () => useModel(el.dataset.modelName));
  });
}
function filterM(f, btn) { document.querySelectorAll('.mfbtn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); renderModels(f); }
function useModel(name) {
  const m = ALL_MODELS.find(x => x.name === name);
  if (m && (m.cat === 'image' || m.cat === 'voice')) {
    showToast('Bild & Sprache – bald im App verfügbar');
    return;
  }
  const sel = document.getElementById('chat-model-sel');
  if (sel) { sel.value = name; if (window._chatModelCsel) window._chatModelCsel.syncDisplay(); }
  openView('chat');
  showToast('Modell: ' + name);
}
renderModels('all');

/* ─── PURCHASE ─── */
const BASE = 1000, MIN = 1000, AVG = 500;
let tokAmt = MIN, curPay = 'card';
const payNames = { card:'Kreditkarte', paypal:'PayPal', gpay:'Google Pay', paysafe:'Paysafecard' };
function fmtTok(t) { if (t >= 1e9) return (t/1e9).toFixed(1).replace(/\.0$/,'')+'B'; if (t >= 1e6) return (t/1e6).toFixed(1).replace(/\.0$/,'')+'M'; if (t >= 1e3) return Math.round(t/1e3)+'K'; return t.toLocaleString(); }
function fmtMsgs(n) { if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M Nachrichten'; if (n >= 1e3) return Math.round(n/1e3)+'K Nachrichten'; return Math.round(n)+' Nachrichten'; }
function fmtP(p) { return '€' + p.toFixed(p < 0.1 ? 4 : 2); }
function calcPrice(t) { return (t/1e6) * BASE; }
function sliderToTok(v) { const mn = Math.log(MIN), mx = Math.log(1e8); return Math.max(MIN, Math.round(Math.exp(mn + (mx-mn)*v/100)/100)*100); }
function tokToSlider(t) { if (t <= MIN) return 0; const mn = Math.log(MIN), mx = Math.log(1e8); return Math.round((Math.log(Math.min(t,1e8))-mn)/(mx-mn)*100); }
function updateEst(prefix) {
  const rows = [{id:'gpt5',mult:2},{id:'llama',mult:0.3},{id:'sonnet',mult:1},{id:'llama8b',mult:0.1}];
  rows.forEach(m => { const el = document.getElementById(prefix+'-'+m.id); if (el) el.textContent = fmtMsgs(tokAmt/(AVG*m.mult)); });
}
function updatePurchase() {
  const price = calcPrice(tokAmt), valid = tokAmt >= MIN;
  document.getElementById('amt-big').textContent = fmtTok(tokAmt);
  document.getElementById('amt-price').textContent = fmtP(price);
  document.getElementById('amt-price').style.color = valid ? 'var(--acc)' : '#FDE68A';
  document.getElementById('min-warn').classList.toggle('show', !valid);
  document.getElementById('btn-to-checkout').disabled = !valid;
  document.getElementById('btn-to-checkout').style.opacity = valid ? '1' : '0.4';
  const sl = document.getElementById('tok-slider');
  sl.style.background = `linear-gradient(to right,${valid?'#22D3EE':'#F59E0B'} ${sl.value}%,#1B2130 ${sl.value}%)`;
  updateEst('e');
}
function selPreset(t, el) { tokAmt = t; document.querySelectorAll('.pbtn').forEach(b => b.classList.remove('active')); el.classList.add('active'); document.getElementById('custom-wrap').style.display = 'none'; document.getElementById('custom-toggle').classList.remove('active'); document.getElementById('tok-slider').value = tokToSlider(t); updatePurchase(); }
function toggleCustom() { const w = document.getElementById('custom-wrap'); const open = w.style.display !== 'flex'; w.style.display = open ? 'flex' : 'none'; document.querySelectorAll('.pbtn').forEach(b => b.classList.remove('active')); if (open) document.getElementById('custom-toggle').classList.add('active'); }
document.getElementById('custom-input').addEventListener('input', function() { const v = parseInt(this.value); if (v > 0) { tokAmt = v; document.getElementById('tok-slider').value = tokToSlider(v); updatePurchase(); } });
document.getElementById('tok-slider').addEventListener('input', function() { tokAmt = sliderToTok(parseInt(this.value)); document.querySelectorAll('.pbtn').forEach(b => b.classList.remove('active')); updatePurchase(); });
function selPay(type, el) { curPay = type; document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active')); el.classList.add('active'); }
function setStep(s) { [1,2,3].forEach(i => { const n = document.getElementById('sn'+i), l = document.getElementById('sl'+i); if (i < s) { n.className = 'step-num done'; n.innerHTML = '✓'; } else if (i === s) { n.className = 'step-num active'; n.textContent = i; l.className = 'step-lbl active'; } else { n.className = 'step-num'; n.textContent = i; l.className = 'step-lbl'; } }); document.getElementById('line1').className = 'step-line' + (s > 1 ? ' done' : ''); document.getElementById('line2').className = 'step-line' + (s > 2 ? ' done' : ''); }
function showPg(n) { document.querySelectorAll('.pg').forEach(p => p.classList.remove('active')); document.getElementById('p-view-'+n).classList.add('active'); }
function goCheckout() { if (tokAmt < MIN) return; const price = calcPrice(tokAmt), tax = price*0.19, total = price+tax; document.getElementById('co-tok').textContent = fmtTok(tokAmt)+'('+tokAmt.toLocaleString()+')'; document.getElementById('co-sub').textContent = fmtP(price); document.getElementById('co-tax').textContent = fmtP(tax); document.getElementById('co-total').textContent = fmtP(total); updateEst('ce'); const isCard = curPay === 'card', isPsc = curPay === 'paysafe'; document.getElementById('co-card').style.display = isCard ? 'block' : 'none'; document.getElementById('co-psc').style.display = isPsc ? 'block' : 'none'; const redir = document.getElementById('co-redir'); if (!isCard && !isPsc) { const msgs = {paypal:'Du wirst sicher zu PayPal weitergeleitet.',gpay:'Google Pay öffnet sich nach dem Klick.'}; redir.innerHTML = msgs[curPay] || ''; redir.classList.add('show'); } else redir.classList.remove('show'); const btnLabels = {card:'Jetzt kaufen & bezahlen →',paypal:'Weiter zu PayPal →',gpay:'Mit Google Pay zahlen →',paysafe:'PIN einlösen & kaufen →'}; document.getElementById('btn-pay').textContent = btnLabels[curPay]; setStep(2); showPg(2); }
function doPayment() { const btn = document.getElementById('btn-pay'); btn.textContent = 'Zahlung wird verarbeitet...'; btn.disabled = true; setTimeout(() => { const price = calcPrice(tokAmt), tax = price*0.19, total = price+tax; document.getElementById('suc-tok').textContent = '+'+fmtTok(tokAmt); document.getElementById('suc-price').textContent = fmtP(total)+' (inkl. MwSt.)'; document.getElementById('suc-method').textContent = payNames[curPay]; document.getElementById('suc-date').textContent = new Date().toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); balance += tokAmt; updateBalance(0); btn.textContent = 'Jetzt kaufen & bezahlen →'; btn.disabled = false; setStep(3); showPg(3); }, 1800); }
function pGoBack(to) { setStep(to); showPg(to); }
function resetPurchase() { tokAmt = MIN; curPay = 'card'; document.getElementById('tok-slider').value = 0; document.querySelectorAll('.pbtn').forEach(b => b.classList.remove('active')); document.querySelector('.pbtn').classList.add('active'); document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active')); document.getElementById('pm-card').classList.add('active'); updatePurchase(); setStep(1); showPg(1); }
function fmtCard(el) { let v = el.value.replace(/\D/g,'').slice(0,16); el.value = v.match(/.{1,4}/g)?.join(' ') || v; }
function fmtExp(el) { let v = el.value.replace(/\D/g,''); if (v.length >= 2) v = v.slice(0,2)+'/'+v.slice(2,4); el.value = v; }
document.getElementById('tok-slider').value = 0;
updatePurchase(); setStep(1);

/* ─── TRANSLATIONS ─── */
const LANGS = {
  de:{settings:'Einstellungen',general:'Allgemein',account:'Konto',appearance:'Darstellung',memory:'Memory',privacy:'Datenschutz',notifications:'Benachrichtigungen',security:'Sicherheit',language:'Sprache',language_desc:'Sprache der Oberfläche',default_model:'Standardmodell',default_model_desc:'Wird für neue Chats verwendet',chat_history:'Chat-Verlauf',chat_history_desc:'Gespräche in der Sidebar anzeigen',compact:'Kompakter Modus',compact_desc:'Weniger Abstände',animations:'Animationen',animations_desc:'Übergänge aktivieren',display_name:'Anzeigename',email:'E-Mail-Adresse',password:'Passwort',password_desc:'Zuletzt geändert vor 30 Tagen',buy_tokens:'Tokens kaufen',balance_desc:'Guthaben verwalten',change:'Ändern',buy:'Kaufen →',danger_zone:'Gefahrenzone',delete_account:'Konto löschen',delete_account_desc:'Alle Daten werden unwiderruflich gelöscht',delete:'Löschen',theme:'Theme',theme_desc:'Farbschema',dark:'Dunkel',light:'Hell',accent_color:'Akzentfarbe',accent_desc:'Farbe für aktive Elemente',font_size:'Schriftgröße',font_size_desc:'Textgröße',small:'Klein',medium:'Mittel',large:'Groß',preview:'Vorschau',preview_text:'Das ist ein Beispieltext mit der aktuellen Schriftgröße.',enable_memory:'Memory aktivieren',enable_memory_desc:'SingleTokens merkt sich Infos aus Gesprächen',stored_memories:'Gespeicherte Erinnerungen',mem1:'Bevorzugt präzise, direkte Antworten',mem1_date:'vor 3 Tagen',mem2:'Arbeitet an SingleTokens',mem2_date:'vor 1 Woche',mem3:'Bevorzugt dunkle UI-Designs',mem3_date:'vor 2 Wochen',clear_all:'Alle löschen',clear_all_desc:'Alle Erinnerungen entfernen',delete_all:'Alle löschen',training_data:'Trainingsdaten',training_data_desc:'Gespräche zur Modellverbesserung',analytics:'Analyse-Daten',analytics_desc:'Anonyme Nutzungsstatistiken teilen',export_chats:'Verlauf exportieren',export_chats_desc:'Als JSON herunterladen',export:'Exportieren',delete_chats:'Verlauf löschen',delete_chats_desc:'Alle Gespräche dauerhaft löschen',email_notifs:'E-Mail-Benachrichtigungen',email_notifs_desc:'Updates per E-Mail',token_warning:'Token-Warnung',token_warning_desc:'Warnung wenn Guthaben unter 50K',new_models_notif:'Neue Modelle',new_models_notif_desc:'Info bei neuen Modellen',marketing_emails:'Marketing-E-Mails',marketing_emails_desc:'Neuigkeiten und Angebote',two_fa:'Zwei-Faktor-Authentifizierung',two_fa_off:'Nicht aktiviert',two_fa_on:'Aktiviert',active_sessions:'Aktive Sitzungen',active_sessions_desc:'1 Gerät · Chrome, Windows 11',sign_out:'Abmelden',api_keys:'API-Keys',revoke:'Sperren',new_key:'+ Neuer Key',saved:'Einstellung gespeichert',pw_sent:'Passwort-Reset-E-Mail gesendet!',exporting:'Export wird vorbereitet...',deleted:'Gelöscht.',sessions_ended:'Andere Sitzungen beendet.',mem_deleted:'Erinnerung gelöscht',all_mem_deleted:'Alle Erinnerungen gelöscht',key_revoked:'Key gesperrt',key_added:'Neuer Key erstellt',compact_on:'Kompakter Modus aktiviert',compact_off:'Kompakter Modus deaktiviert',twofa_on:'2FA aktiviert',twofa_off:'2FA deaktiviert'},
  en:{settings:'Settings',general:'General',account:'Account',appearance:'Appearance',memory:'Memory',privacy:'Privacy',notifications:'Notifications',security:'Security',language:'Language',language_desc:'Interface language',default_model:'Default model',default_model_desc:'Used for new chats',chat_history:'Chat history',chat_history_desc:'Show in sidebar',compact:'Compact mode',compact_desc:'Less spacing',animations:'Animations',animations_desc:'Enable transitions',display_name:'Display name',email:'Email address',password:'Password',password_desc:'Changed 30 days ago',buy_tokens:'Buy tokens',balance_desc:'Manage balance',change:'Change',buy:'Buy →',danger_zone:'Danger zone',delete_account:'Delete account',delete_account_desc:'All data will be permanently deleted',delete:'Delete',theme:'Theme',theme_desc:'Color scheme',dark:'Dark',light:'Light',accent_color:'Accent color',accent_desc:'Color for active elements',font_size:'Font size',font_size_desc:'Text size',small:'Small',medium:'Medium',large:'Large',preview:'Preview',preview_text:'This is a preview text with the current font size.',enable_memory:'Enable memory',enable_memory_desc:'SingleTokens remembers info from chats',stored_memories:'Stored memories',mem1:'Prefers precise, direct answers',mem1_date:'3 days ago',mem2:'Working on SingleTokens',mem2_date:'1 week ago',mem3:'Prefers dark UI designs',mem3_date:'2 weeks ago',clear_all:'Clear all',clear_all_desc:'Remove all memories',delete_all:'Delete all',training_data:'Training data',training_data_desc:'Use chats to improve models',analytics:'Analytics',analytics_desc:'Share anonymous usage stats',export_chats:'Export history',export_chats_desc:'Download as JSON',export:'Export',delete_chats:'Delete history',delete_chats_desc:'Permanently delete all chats',email_notifs:'Email notifications',email_notifs_desc:'Receive updates by email',token_warning:'Token warning',token_warning_desc:'Alert when balance drops below 50K',new_models_notif:'New models',new_models_notif_desc:'Notify on new models',marketing_emails:'Marketing emails',marketing_emails_desc:'News and offers',two_fa:'Two-factor authentication',two_fa_off:'Not enabled',two_fa_on:'Enabled',active_sessions:'Active sessions',active_sessions_desc:'1 device · Chrome, Windows 11',sign_out:'Sign out',api_keys:'API Keys',revoke:'Revoke',new_key:'+ New key',saved:'Setting saved',pw_sent:'Password reset email sent!',exporting:'Preparing export...',deleted:'Deleted.',sessions_ended:'Other sessions ended.',mem_deleted:'Memory deleted',all_mem_deleted:'All memories deleted',key_revoked:'Key revoked',key_added:'New key created',compact_on:'Compact mode enabled',compact_off:'Compact mode disabled',twofa_on:'2FA enabled',twofa_off:'2FA disabled'}
};
let lang = 'de';
function T(k) { return (LANGS[lang] || LANGS.de)[k] || k; }
function applyLang() {
  document.querySelectorAll('[data-t]').forEach(el => {
    if (el.tagName === 'OPTION') return;
    const v = T(el.getAttribute('data-t'));
    if (v !== undefined) el.textContent = v;
  });
  document.querySelectorAll('select option[data-t]').forEach(opt => {
    const v = T(opt.getAttribute('data-t'));
    if (v !== undefined) opt.textContent = v;
  });
  _cselInstances.forEach(cs => cs.refresh());
}
function setLang(l) { lang = l; applyLang(); showToast(T('saved')); }

/* ─── SETTINGS ─── */
function sGo(id, el) { document.querySelectorAll('.s-pg').forEach(p => p.classList.remove('active')); document.querySelectorAll('.s-nav').forEach(n => n.classList.remove('active')); document.getElementById('s-'+id).classList.add('active'); el.classList.add('active'); }
function sTog(el, key) { el.classList.toggle('on'); const on = el.classList.contains('on'); if (key === 'compact') { document.getElementById('app').classList.toggle('compact-mode', on); showToast(on ? T('compact_on') : T('compact_off')); } else showToast(T('saved')); }
function setTheme(v) {
  const app = document.getElementById('app');
  const dark = v === 'dark', light = v === 'light';
  app.classList.toggle('light-mode', light);
  document.body.classList.toggle('light-mode', light);
  app.classList.toggle('dark-mode', dark);
  document.body.classList.toggle('dark-mode', dark);
  const r = document.documentElement.style;
  if (dark) {
    r.setProperty('--dark','#0D0D0D'); r.setProperty('--dark2','#141414');
    r.setProperty('--dark3','#1A1A1A'); r.setProperty('--dark4','#222222');
    r.setProperty('--text','#F0F0F0'); r.setProperty('--muted','#666666');
    r.setProperty('--muted2','#9CA3AF'); r.setProperty('--border','rgba(255,255,255,0.1)');
    r.setProperty('--bhard','3px solid #E0E0E0');
    r.setProperty('--shadow','4px 4px 0 #E0E0E0');
    r.setProperty('--shadow-sm','3px 3px 0 #E0E0E0');
  } else if (light) {
    r.setProperty('--dark','#EEEBD8'); r.setProperty('--dark2','#F8F5E8');
    r.setProperty('--dark3','#E8E5D0'); r.setProperty('--dark4','#E0DCC8');
    r.setProperty('--text','#111111'); r.setProperty('--muted','#888888');
    r.setProperty('--muted2','#555555'); r.setProperty('--border','rgba(17,17,17,0.1)');
    r.setProperty('--bhard','3px solid #111111');
    r.setProperty('--shadow','4px 4px 0 #111111');
    r.setProperty('--shadow-sm','3px 3px 0 #111111');
  } else {
    ['--dark','--dark2','--dark3','--dark4','--text','--muted','--muted2','--border','--bhard','--shadow','--shadow-sm'].forEach(p => r.removeProperty(p));
  }
  localStorage.setItem('st_pref_theme', v);
  showToast(T('saved'));
}
function setAccent(c, el) { document.querySelectorAll('.sw').forEach(s => s.classList.remove('active')); el.classList.add('active'); document.documentElement.style.setProperty('--acc', c); showToast(T('saved')); }
function setFontSize(s) { document.documentElement.style.setProperty('--font-size', s); document.getElementById('s-preview').style.fontSize = s; showToast(T('saved')); }
function saveName(v) {
  document.getElementById('s-display-name').textContent = v;
  document.getElementById('s-av').textContent = v.charAt(0).toUpperCase();
  document.getElementById('sidebar-av').textContent = v.charAt(0).toUpperCase();
  document.getElementById('sidebar-name').textContent = v;
  const cached = JSON.parse(localStorage.getItem('st_user') || '{}');
  cached.name = v;
  localStorage.setItem('st_user', JSON.stringify(cached));
  const wg = document.getElementById('welcome-greeting');
  if (wg) wg.textContent = 'Schön, dich zu sehen, ' + v + '.';
  showToast(T('saved'));
}
function saveEmail(v) {
  document.getElementById('s-display-email').textContent = v;
  document.getElementById('sidebar-email').textContent = v;
  const cached = JSON.parse(localStorage.getItem('st_user') || '{}');
  cached.email = v;
  localStorage.setItem('st_user', JSON.stringify(cached));
  showToast(T('saved'));
}
function confirmDel() { showConfirm({title:'Konto löschen',msg:'Alle Daten werden <strong>unwiderruflich gelöscht</strong>.',okLabel:'Konto löschen',onOk:()=>showToast(T('deleted'))}); }
function toggleTwoFA(el) { el.classList.toggle('on'); const on = el.classList.contains('on'); document.getElementById('twofa-desc').textContent = on ? T('two_fa_on') : T('two_fa_off'); showToast(on ? T('twofa_on') : T('twofa_off')); }
function revokeKey(btn, name) { const i = btn.closest('.mem-item'); i.style.opacity = '0'; i.style.transition = 'opacity .2s'; setTimeout(() => i.remove(), 200); showToast(T('key_revoked')); }
function addKey() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqr23456789';
  const buf = new Uint8Array(10);
  crypto.getRandomValues(buf);
  let k = 'sk-aizz-';
  for (let i = 0; i < 10; i++) k += chars[buf[i] % chars.length];
  const d = document.createElement('div'); d.className = 'mem-item';
  d.innerHTML = `<div style="flex:1"><div style="font-size:12px;color:var(--text);font-weight:600">New Key</div><div style="font-family:'DM Mono',monospace;font-size:11px;color:var(--muted2);margin-top:2px">${k}••••</div></div><button class="s-dbtn" style="font-size:11px" onclick="revokeKey(this,'New Key')">${T('revoke')}</button>`;
  document.getElementById('api-keys').appendChild(d); showToast(T('key_added'));
}
function delMem(btn) { const i = btn.closest('.mem-item'); i.style.opacity = '0'; i.style.transition = 'opacity .2s'; setTimeout(() => i.remove(), 200); showToast(T('mem_deleted')); }
function clearMem() { document.querySelectorAll('#mem-list .mem-item').forEach(m => { m.style.opacity = '0'; m.style.transition = 'opacity .2s'; setTimeout(() => m.remove(), 200); }); showToast(T('all_mem_deleted')); }

/* ─── TOAST ─── */
let toastTimer;
function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }

/* ─── YOUR GPTs ─── */
let gpts = [], editingGptId = null;
function renderGpts() {
  const grid = document.getElementById('gpt-grid'), empty = document.getElementById('gpt-empty');
  if (gpts.length === 0) { grid.style.display = 'none'; empty.style.display = 'flex'; return; }
  empty.style.display = 'none'; grid.style.display = 'grid';
  grid.innerHTML = gpts.map((g,i) => `<div style="background:var(--dark2);border:1px solid var(--border);border-radius:12px;padding:18px;transition:all .2s;animation:cardIn .3s ${i*0.05}s ease both;cursor:pointer" onmouseover="this.style.borderColor='rgba(34,211,238,.3)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform=''"><div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px"><div style="width:38px;height:38px;border-radius:10px;background:rgba(34,211,238,.12);border:1px solid rgba(34,211,238,.2);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🤖</div><div style="display:flex;gap:6px"><button onclick="editGpt(${g.id})" style="padding:4px 10px;background:var(--dark3);border:1px solid var(--border);border-radius:6px;color:var(--muted2);font-size:11px;cursor:pointer;font-family:'Syne',sans-serif">Bearbeiten</button><button onclick="deleteGpt(${g.id})" style="padding:4px 10px;background:transparent;border:1px solid rgba(248,113,113,.3);border-radius:6px;color:#F87171;font-size:11px;cursor:pointer;font-family:'Syne',sans-serif">Löschen</button></div></div><div style="font-size:14px;font-weight:700;margin-bottom:4px">${escHtml(g.name)}</div><div style="font-size:12px;color:var(--muted2);margin-bottom:10px;line-height:1.5">${escHtml(g.desc||'Keine Beschreibung')}</div><div style="display:flex;align-items:center;justify-content:space-between"><span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted2)">${escHtml(g.model)}</span><button onclick="useGpt(${g.id})" style="padding:5px 12px;background:var(--acc);border:none;border-radius:6px;color:#0A0C10;font-size:11px;font-weight:800;cursor:pointer;font-family:'Syne',sans-serif">Chatten →</button></div></div>`).join('');
}
function openGptModal(id=null) {
  editingGptId = id;
  if (id !== null) {
    const g = gpts.find(x => x.id === id);
    document.getElementById('gpt-modal-title').textContent = 'GPT bearbeiten';
    document.getElementById('gpt-name').value = g.name;
    document.getElementById('gpt-desc').value = g.desc || '';
    document.getElementById('gpt-model').value = g.model;
    if (window._gptModelCsel) window._gptModelCsel.syncDisplay();
    document.getElementById('gpt-prompt').value = g.prompt;
    document.getElementById('gpt-temp').value = g.temp;
    document.getElementById('gpt-cap').value = g.cap || '';
    document.getElementById('gpt-save-btn').textContent = 'Speichern';
  } else {
    document.getElementById('gpt-modal-title').textContent = 'Neuer GPT';
    document.getElementById('gpt-name').value = '';
    document.getElementById('gpt-desc').value = '';
    document.getElementById('gpt-model').value = 'Llama 3.3 70B';
    if (window._gptModelCsel) window._gptModelCsel.syncDisplay();
    document.getElementById('gpt-prompt').value = '';
    document.getElementById('gpt-temp').value = '0.7';
    document.getElementById('gpt-cap').value = '';
    document.getElementById('gpt-save-btn').textContent = 'GPT erstellen';
  }
  document.getElementById('gpt-modal').style.display = 'flex';
}
function closeGptModal() { document.getElementById('gpt-modal').style.display = 'none'; editingGptId = null; }
function saveGpt() {
  const name = document.getElementById('gpt-name').value.trim();
  const prompt = document.getElementById('gpt-prompt').value.trim();
  if (!name) { showToast('Bitte einen Namen eingeben!'); return; }
  if (!prompt) { showToast('Bitte einen System-Prompt eingeben!'); return; }
  const gpt = { id: editingGptId !== null ? editingGptId : Date.now(), name, desc: document.getElementById('gpt-desc').value.trim(), model: document.getElementById('gpt-model').value, prompt, temp: parseFloat(document.getElementById('gpt-temp').value) || 0.7, cap: parseInt(document.getElementById('gpt-cap').value) || null };
  if (editingGptId !== null) { gpts = gpts.map(g => g.id === editingGptId ? gpt : g); showToast('GPT gespeichert!'); }
  else { gpts.push(gpt); showToast('GPT erstellt!'); }
  closeGptModal(); renderGpts();
}
function editGpt(id) { openGptModal(id); }
function deleteGpt(id) { const g = gpts.find(x => x.id === id); if (!g) return; showConfirm({title:'GPT löschen',msg:`GPT <strong>"${escHtml(g.name)}"</strong> wirklich löschen?`,okLabel:'Löschen',onOk:()=>{gpts=gpts.filter(x=>x.id!==id);renderGpts();showToast('GPT gelöscht.');}}); }
function useGpt(id) { const g = gpts.find(x => x.id === id); if (!g) return; const sel = document.getElementById('chat-model-sel'); if (sel) { sel.value = g.model; if (window._chatModelCsel) window._chatModelCsel.syncDisplay(); } openView('chat'); newChat(); if (typeof setGptPrompt === 'function') setGptPrompt(g.prompt); showToast('GPT "'+g.name+'" geladen!'); }
renderGpts();

/* ─── HELPER: UI UPDATE ─── */
function _applyUserToUI(user) {
  if (!user) return;
  balance = user.balance || 0;
  updateBalance(0);
  const n = user.name || 'User';
  const email = user.email || '';
  document.getElementById('s-av').textContent = n.charAt(0).toUpperCase();
  document.getElementById('sidebar-av').textContent = n.charAt(0).toUpperCase();
  document.getElementById('s-display-name').textContent = n;
  const nameInput = document.getElementById('s-name-input');
  if (nameInput) nameInput.value = n;
  document.getElementById('sidebar-name').textContent = n;
  document.getElementById('s-display-email').textContent = email;
  const emailInput = document.getElementById('s-email-input');
  if (emailInput) emailInput.value = email;
  document.getElementById('sidebar-email').textContent = email;
  document.getElementById('s-tok-badge').textContent = fmtBalance() + ' Tokens';
  const wg = document.getElementById('welcome-greeting');
  if (wg) wg.textContent = 'Schön, dich zu sehen, ' + n + '.';
}

// ─── BOOT ───
(async function initApp() {
  if (typeof _getToken === 'function' && !_getToken()) { window.location.href = '/login.html'; return; }

  const cached = JSON.parse(localStorage.getItem('st_user') || 'null');
  if (cached) _applyUserToUI(cached);

  const user = await apiGetUser();
  if (user) {
    localStorage.setItem('st_user', JSON.stringify(user));
    _applyUserToUI(user);
  }

  const serverGpts = await apiFetchGpts();
  gpts = serverGpts;
  renderGpts();
})();

/* ─── BOOT ─── */
initCustomSelects();
applyLang();

// Theme aus localStorage laden
(function() {
  const theme = localStorage.getItem('st_pref_theme');
  if (theme === 'dark' || theme === 'light') setTheme(theme);
  const themeEl = document.getElementById('theme-sel');
  if (themeEl && theme) themeEl.value = theme;
  const accent = localStorage.getItem('st_pref_accent');
  if (accent) { document.documentElement.style.setProperty('--acc', accent); document.querySelectorAll('.sw').forEach(s => { s.classList.toggle('active', s.style.background === accent); }); }
})();

// Sofort aus localStorage füllen (bevor api.js geladen ist)
(function() {
  const cached = JSON.parse(localStorage.getItem('st_user') || 'null');
  if (!cached) return;
  const n = cached.name || '';
  const email = cached.email || '';
  const nameInput = document.getElementById('s-name-input');
  const emailInput = document.getElementById('s-email-input');
  if (nameInput && n) nameInput.value = n;
  if (emailInput && email) emailInput.value = email;
  if (n) {
    const sName = document.getElementById('s-display-name');
    const sEmail = document.getElementById('s-display-email');
    const sAv = document.getElementById('s-av');
    const sbAv = document.getElementById('sidebar-av');
    const sbName = document.getElementById('sidebar-name');
    const sbEmail = document.getElementById('sidebar-email');
    if (sName) sName.textContent = n;
    if (sEmail) sEmail.textContent = email;
    if (sAv) sAv.textContent = n.charAt(0).toUpperCase();
    if (sbAv) sbAv.textContent = n.charAt(0).toUpperCase();
    if (sbName) sbName.textContent = n;
    if (sbEmail) sbEmail.textContent = email;
    const wg = document.getElementById('welcome-greeting');
    if (wg) wg.textContent = _getWelcomeGreeting();
  }
})();
