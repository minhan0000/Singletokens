// Custom request ({ }): a terminal-style editor for the raw API request.
// It works on a COPY of the chat. Nothing here is saved and the real chat never changes.

import { el, esc, icons, $, $$, fmtInt, renderMarkdown, highlightJson, copyText, toast } from './ui.js';
import * as api from './api.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const ROLES = ['system', 'user', 'assistant'];

// Number params shown under // PARAMS. Empty = left out of the request (model default).
const NUM_PARAMS = [
  { key: 'temperature', min: 0, max: 2, step: 0.1, always: true },
  { key: 'max_tokens', min: 1, step: 1, always: true },
  { key: 'top_p', min: 0, max: 1, step: 0.05 },
  { key: 'top_k', min: 1, step: 1 },
  { key: 'frequency_penalty', min: -2, max: 2, step: 0.1 },
  { key: 'presence_penalty', min: -2, max: 2, step: 0.1 },
];

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

export async function openCustom({ chat, target, draft, onCreditChanged }) {
  // ── Starting state: a copy of the chat ──
  const gpt = target.kind === 'gpt' ? api.getGpt(target.id) : null;
  const params = { model: gpt ? gpt.modelId : target.id };
  const s = gpt?.settings || {};
  for (const p of NUM_PARAMS) params[p.key] = s[p.key] ?? (p.key === 'temperature' ? 0.7 : null);
  params.stop = s.stop?.length ? [...s.stop] : [];

  const messages = [];
  if (gpt) messages.push({ role: 'system', content: gpt.instructions + (gpt.memory ? '\n\nMemory (JSON):\n' + gpt.memory : '') });
  for (const m of chat?.messages || []) messages.push({ role: m.role, content: m.content });
  if (draft?.trim()) messages.push({ role: 'user', content: draft.trim() });
  if (!messages.length) messages.push({ role: 'user', content: '' });

  const catalog = await api.getCatalog();
  let response = null, sending = false;

  const prevFocus = document.activeElement;
  const root = el(`<div class="term" role="dialog" aria-modal="true" aria-label="Custom request" data-tab="editor">
    <div class="term-bar">
      <div class="term-path">~/chats/${esc(chat?.title || 'new_chat')} › <b>custom_request</b></div>
      <button class="btn btn-primary" data-send>Send <span class="kbd">${isMac ? '⌘' : 'Ctrl'}↵</span></button>
      <button class="icon-btn" data-close aria-label="Close custom request"><i data-lucide="x"></i></button>
    </div>
    <div class="term-tabs only-phone" role="tablist">
      <button class="resp-tab is-active" data-tab-btn="editor" role="tab">editor</button>
      <button class="resp-tab" data-tab-btn="request" role="tab">request</button>
      <button class="resp-tab" data-tab-btn="response" role="tab">response</button>
    </div>
    <div class="term-body">
      <div class="term-pane term-left">
        <div class="pane-head">// params</div>
        <div class="params"></div>
        <div class="pane-head">// messages</div>
        <div class="msgs"></div>
        <div class="term-add"><button class="term-btn" data-add>+ add message</button>
          <select class="term-btn" data-role aria-label="Role for new message">${ROLES.map(r => `<option${r === 'user' ? ' selected' : ''}>${r}</option>`).join('')}</select></div>
      </div>
      <div class="term-split">
        <div class="term-pane term-req">
          <div class="pane-head">// request <span class="muted">POST ${ENDPOINT.replace('https://', '')}</span></div>
          <div class="json-view"></div>
        </div>
        <div class="term-pane term-resp">
          <div class="pane-head">// response</div>
          <div class="resp-body"><p class="resp-wait muted">// press Send to see the response</p></div>
        </div>
      </div>
    </div></div>`);

  const paramsBox = $('.params', root), msgsBox = $('.msgs', root), jsonBox = $('.json-view', root);
  const respBody = $('.resp-body', root), split = $('.term-split', root);
  const sendBtn = $('[data-send]', root);

  // ── The request body, exactly as it will be sent ──
  function body() {
    const m = api.getModel(params.model);
    const b = { model: params.model, messages: messages.map(x => ({ role: x.role, content: x.content })) };
    for (const p of NUM_PARAMS) if (params[p.key] !== null && params[p.key] !== '' && (p.always || m.params.includes(p.key))) b[p.key] = params[p.key];
    if (params.stop.length && m.params.includes('stop')) b.stop = params.stop;
    return b;
  }

  function paintJson() {
    const html = highlightJson(body());
    const lines = html.split('\n').length;
    jsonBox.innerHTML = `<div class="json-gutter" aria-hidden="true">${Array.from({ length: lines }, (_, i) => i + 1).join('<br>')}</div><pre class="json-code">${html}</pre>`;
  }

  // ── // PARAMS ──
  function paintParams() {
    const m = api.getModel(params.model);
    paramsBox.innerHTML = '';
    const modelRow = el(`<div class="param-row"><label class="key" for="cp-model">model</label>
      <select id="cp-model">${catalog.map(c => `<option value="${esc(c.id)}"${c.id === params.model ? ' selected' : ''}>${esc(c.id)}</option>`).join('')}</select></div>`);
    $('select', modelRow).addEventListener('change', e => { params.model = e.target.value; paintParams(); paintJson(); });
    paramsBox.appendChild(modelRow);
    for (const p of NUM_PARAMS.filter(p => p.always || m.params.includes(p.key))) {
      const row = el(`<div class="param-row"><label class="key" for="cp-${p.key}">${p.key}</label>
        <input id="cp-${p.key}" type="number" step="${p.step}"${p.min !== undefined ? ` min="${p.min}"` : ''}${p.max !== undefined ? ` max="${p.max}"` : ''} placeholder="default" value="${params[p.key] ?? ''}"></div>`);
      $('input', row).addEventListener('input', e => { params[p.key] = e.target.value === '' ? null : Number(e.target.value); paintJson(); });
      paramsBox.appendChild(row);
    }
    if (m.params.includes('stop')) {
      const row = el(`<div class="param-row"><label class="key" for="cp-stop">stop</label>
        <input id="cp-stop" placeholder="comma,separated" value="${esc(params.stop.join(','))}"></div>`);
      $('input', row).addEventListener('input', e => { params.stop = e.target.value.split(',').filter(Boolean).slice(0, 4); paintJson(); });
      paramsBox.appendChild(row);
    }
  }

  // ── // MESSAGES ──
  function paintMessages(focusIndex) {
    msgsBox.innerHTML = '';
    messages.forEach((msg, i) => {
      const block = el(`<div class="term-msg">
        <button class="role-tag role-${msg.role}" title="Change role" aria-label="Role: ${msg.role}. Click to change">[${msg.role}]</button>
        <div class="term-msg-actions">
          <button class="term-btn" data-up aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button>
          <button class="term-btn" data-down aria-label="Move down"${i === messages.length - 1 ? ' disabled' : ''}>↓</button>
          <button class="term-btn" data-del aria-label="Delete message">✕</button>
        </div>
        <textarea rows="1" spellcheck="false" aria-label="${msg.role} message ${i + 1}" placeholder="…"></textarea></div>`);
      const ta = $('textarea', block);
      ta.value = msg.content;
      ta.addEventListener('input', () => { msg.content = ta.value; grow(ta); paintJson(); });
      $('.role-tag', block).addEventListener('click', () => { msg.role = ROLES[(ROLES.indexOf(msg.role) + 1) % ROLES.length]; paintMessages(); paintJson(); });
      $('[data-up]', block).addEventListener('click', () => move(i, -1));
      $('[data-down]', block).addEventListener('click', () => move(i, 1));
      $('[data-del]', block).addEventListener('click', () => { messages.splice(i, 1); paintMessages(); paintJson(); });
      msgsBox.appendChild(block);
      requestAnimationFrame(() => grow(ta));
    });
    if (!messages.length) msgsBox.appendChild(el(`<p class="muted" style="margin:0 var(--sp-16) var(--sp-12)">// no messages — add one below</p>`));
    if (focusIndex !== undefined) $$('textarea', msgsBox)[focusIndex]?.focus();
  }
  const grow = ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= messages.length) return;
    [messages[i], messages[j]] = [messages[j], messages[i]];
    paintMessages();
    paintJson();
  }
  $('[data-add]', root).addEventListener('click', () => {
    messages.push({ role: $('[data-role]', root).value, content: '' });
    paintMessages(messages.length - 1);
    paintJson();
  });

  // ── Send + response ──
  async function send() {
    if (sending) return;
    const b = body();
    if (!b.messages.some(m => m.content.trim())) return toast('Add at least one message with text', { error: true });
    sending = true;
    sendBtn.disabled = true;
    split.classList.add('has-response');
    setTab('response');
    respBody.innerHTML = `<div class="resp-wait"><span class="cursor">▍</span></div>`;
    try {
      response = await api.sendCustom(b);
      response.sentBody = b;
      onCreditChanged?.(response.creditTokens);
      paintResponse('rendered');
    } catch (err) {
      respBody.innerHTML = `<div class="resp-stats"><span class="err">ERROR</span> ${esc(err.message)}</div>`;
    }
    sending = false;
    sendBtn.disabled = false;
  }

  function paintResponse(view) {
    const r = response, ok = r.status < 400;
    const text = r.raw.choices?.[0]?.message?.content || '';
    respBody.innerHTML = `
      <div class="resp-tabs" role="tablist">
        <button class="resp-tab${view === 'rendered' ? ' is-active' : ''}" data-view="rendered" role="tab">rendered</button>
        <button class="resp-tab${view === 'raw' ? ' is-active' : ''}" data-view="raw" role="tab">raw</button>
      </div>
      <div class="resp-stats"><span><span class="${ok ? 'ok' : 'err'}">${r.status} ${esc(r.statusText)}</span> · ${fmtInt(r.cost)} ST · $${(r.cost / 100000).toFixed(4)} · ${(r.ms / 1000).toFixed(1)}s</span>
        <button class="term-btn" data-curl>Copy as curl</button></div>
      ${view === 'rendered' ? `<div class="resp-rendered md">${renderMarkdown(text)}</div>` : `<div class="json-view"><pre class="json-code" style="padding-left:var(--sp-16)">${highlightJson(r.raw)}</pre></div>`}`;
    $$('[data-view]', respBody).forEach(b => b.addEventListener('click', () => paintResponse(b.dataset.view)));
    $('[data-curl]', respBody).addEventListener('click', () => copyText(curl(r.sentBody)));
    icons(respBody);
  }

  // The same request as a terminal command. The key stays a placeholder: users fill in their own.
  function curl(b) {
    const json = JSON.stringify(b, null, 2).replace(/'/g, `'\\''`);
    return `curl ${ENDPOINT} \\\n  -H "Authorization: Bearer $OPENROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${json}'`;
  }

  // ── Phone tabs ──
  function setTab(tab) {
    root.dataset.tab = tab;
    $$('[data-tab-btn]', root).forEach(b => { b.classList.toggle('is-active', b.dataset.tabBtn === tab); b.setAttribute('aria-selected', b.dataset.tabBtn === tab); });
  }
  $$('[data-tab-btn]', root).forEach(b => b.addEventListener('click', () => setTab(b.dataset.tabBtn)));

  // ── Open / close ──
  function close() {
    root.remove();
    document.removeEventListener('keydown', onKey, true);
    prevFocus?.focus?.();
  }
  function onKey(e) {
    if (e.key === 'Escape' && !document.querySelector('[data-popover]')) { e.preventDefault(); close(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
  }
  document.addEventListener('keydown', onKey, true);
  sendBtn.addEventListener('click', send);
  $('[data-close]', root).addEventListener('click', close);

  document.body.appendChild(root);
  paintParams();
  paintMessages();
  paintJson();
  icons(root);
  $('textarea', msgsBox)?.focus();
}
