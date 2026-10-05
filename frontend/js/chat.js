// Chat screen: top bar with model picker, messages, empty state, composer with cost estimate.

import { el, esc, icons, $, $$, fmtInt, fmtUsd, fmtMult, renderMarkdown, toast, copyText, openPopover } from './ui.js';
import { describeTarget } from './sidebar.js';
import * as api from './api.js';
import { openCustom } from './custom.js';
import { MAX_FILES, readFile, acceptFor, fmtBytes } from './attachments.js';

const DEFAULT_TARGET = { kind: 'model', id: 'anthropic/claude-sonnet-4.5' };

const targetModelId = t => (t.kind === 'gpt' ? api.getGpt(t.id).modelId : t.id);
const sameTarget = (a, b) => a.kind === b.kind && a.id === b.id;

export async function renderChat(main, ctx) {
  const { chatId, user, go, onChatsChanged, onCreditChanged, openDrawer } = ctx;
  let chat = chatId ? await api.getChat(chatId) : null;
  if (chatId && !chat) return go('#/new');
  // Shortcuts: the 3 most recent models/GPTs, or the user's own models before they have chats.
  let recents = await api.getRecentTargets();
  if (!recents.length) recents = (await api.getMyModels()).slice(0, 3).map(m => ({ kind: 'model', id: m.id }));
  let target = chat ? chat.target : (ctx.initialTarget || recents[0] || DEFAULT_TARGET);
  let sending = false;
  let pending = [];  // attachments waiting to be sent with the next message

  main.innerHTML = `
    <div class="topbar">
      <button class="icon-btn only-phone" data-drawer aria-label="Open menu"><i data-lucide="menu"></i></button>
      <button class="model-btn" aria-haspopup="listbox"></button>
    </div>
    <div class="chat-scroll"><div class="messages" aria-live="polite"></div></div>
    <div class="drop-overlay" hidden><div><i data-lucide="paperclip"></i>Drop files to attach</div></div>
    <div class="composer-wrap">
      <div class="attach-row" hidden></div>
      <input type="file" multiple hidden data-file-input>
      <div class="composer">
        <button class="icon-btn round" data-attach aria-label="Attach file"><i data-lucide="paperclip"></i></button>
        <textarea rows="1" placeholder="Message SingleTokens" aria-label="Message"></textarea>
        <button class="icon-btn round" data-custom aria-label="Custom request"><i data-lucide="braces"></i></button>
        <button class="send-btn" aria-label="Send" disabled><i data-lucide="arrow-up"></i></button>
      </div>
      <div class="composer-hint"></div>
    </div>`;

  const modelBtn = $('.model-btn', main);
  const scroller = $('.chat-scroll', main);
  const list = $('.messages', main);
  const input = $('textarea', main);
  const sendBtn = $('.send-btn', main);
  const hint = $('.composer-hint', main);
  const attach = $('[data-attach]', main);
  const fileInput = $('[data-file-input]', main);
  const attachRow = $('.attach-row', main);
  const dropOverlay = $('.drop-overlay', main);

  $('[data-drawer]', main).addEventListener('click', openDrawer);

  // ── Model button + picker ──
  function paintModelBtn() {
    const t = describeTarget(target);
    const m = api.getModel(targetModelId(target));
    modelBtn.innerHTML = `<span class="prov-sq p-${t.p}">${esc(t.name.charAt(0))}</span>${esc(t.name)}<i data-lucide="chevron-down" class="chev"></i>`;
    modelBtn.setAttribute('aria-label', `Model: ${t.name}. Change model`);
    attach.disabled = !(m.images || m.files);
    attach.dataset.tooltip = m.images ? 'Attach images or text files' : `${m.name} can't read images. Text files only.`;
    fileInput.accept = acceptFor(m);
    // Switching to a model that can't see images drops the waiting images.
    if (!m.images && pending.some(a => a.kind === 'image')) {
      pending = pending.filter(a => a.kind !== 'image');
      paintAttachRow();
      toast(`${m.name} can't read images, so they were removed.`, { error: true });
    }
    icons(modelBtn);
  }
  modelBtn.addEventListener('click', () => openPicker(modelBtn, recents, async t => {
    target = t;
    if (chat) await api.setChatTarget(chat.id, t);
    paintModelBtn();
    paintHint();
    input.focus();
  }));

  // ── Messages ──
  function paint() {
    list.innerHTML = '';
    if (!chat || !chat.messages.length) return paintEmpty();
    const lastAi = chat.messages.map(m => m.role).lastIndexOf('assistant');
    chat.messages.forEach((m, i) => list.appendChild(m.role === 'user' ? userBubble(m) : aiBubble(m, i === lastAi)));
    icons(list);
    scroller.scrollTop = scroller.scrollHeight;
  }

  function paintEmpty() {
    const box = el(`<div class="empty-chat"><h1>What do you want to ask?</h1><div class="pills"></div></div>`);
    for (const t of recents) {
      const d = describeTarget(t);
      const p = el(`<button class="pill${sameTarget(t, target) ? ' is-active' : ''}"><span class="prov-dot p-${d.p}"></span>${esc(d.name)}</button>`);
      p.addEventListener('click', () => { target = t; paintModelBtn(); paintHint(); paintEmpty(); input.focus(); });
      $('.pills', box).appendChild(p);
    }
    list.innerHTML = '';
    list.appendChild(box);
  }

  function userBubble(m) {
    const wrap = el(`<div class="msg-user-wrap"></div>`);
    if (m.attachments?.length) wrap.appendChild(filesView(m.attachments));
    if (m.content) wrap.appendChild(el(`<div class="msg-user">${esc(m.content)}</div>`));
    return wrap;
  }

  // Thumbnails and file chips shown above a sent message.
  function filesView(list) {
    const box = el(`<div class="msg-files"></div>`);
    for (const a of list) {
      if (a.kind === 'image') {
        const b = el(`<button class="msg-image" aria-label="Open ${esc(a.name)}"><img alt="${esc(a.name)}" loading="lazy"></button>`);
        $('img', b).src = a.dataUrl;
        b.addEventListener('click', () => openImage(a));
        box.appendChild(b);
      } else {
        box.appendChild(el(`<div class="file-chip"><i data-lucide="file-text"></i><span class="name">${esc(a.name)}</span></div>`));
      }
    }
    return box;
  }

  function aiBubble(m, isLast) {
    const model = api.getModel(m.modelId);
    const gpt = m.gptId ? api.getGpt(m.gptId) : null;  // null if the GPT was deleted since
    const by = gpt ? `Generated by <b>${esc(gpt.name)}</b> using <b>${esc(model.name)}</b>` : `Generated using <b>${esc(model.name)}</b>`;
    const wrap = el(`<div class="msg-ai-wrap">
      <div class="msg-ai md">${renderMarkdown(m.content)}</div>
      <div class="msg-meta"><span>${by} · It cost you <b>${fmtInt(m.cost)} SingleTokens</b> (${fmtUsd(m.cost)})</span>
        <span class="msg-actions">
          <button class="icon-btn sm" data-copy aria-label="Copy answer"><i data-lucide="copy"></i></button>
          ${isLast ? '<button class="icon-btn sm" data-retry aria-label="Retry"><i data-lucide="rotate-ccw"></i></button>' : ''}
        </span></div></div>`);
    $('[data-copy]', wrap).addEventListener('click', () => copyText(m.content));
    $('[data-retry]', wrap)?.addEventListener('click', retry);
    $$('[data-copy-code]', wrap).forEach(b => b.addEventListener('click', () => copyText(b.closest('.code-block').querySelector('code').textContent)));
    return wrap;
  }

  // ── Composer ──
  // Credit we can't read (OpenRouter didn't share it) doesn't block sending.
  const hasCredit = () => user.creditKnown === false || user.creditTokens > 0;

  function canSend() {
    return !sending && (input.value.trim() || pending.length) && user.openrouterConnected && hasCredit();
  }

  function paintHint() {
    if (!user.openrouterConnected) {
      hint.innerHTML = `Connect OpenRouter to send messages. <a href="#/openrouter">Connect</a>`;
    } else if (!hasCredit()) {
      hint.innerHTML = `Your OpenRouter credit is empty. <a href="#/openrouter">Top up</a>`;
    } else {
      const g = target.kind === 'gpt' ? api.getGpt(target.id) : null;
      const sys = g ? g.instructions + g.memory : '';
      const est = api.estimate(targetModelId(target), chat ? chat.messages : [], input.value, sys, pending);
      hint.textContent = `This message is ${fmtInt(est.input)} SingleTokens long. Estimated output: ~${fmtInt(est.output)} SingleTokens`;
    }
    sendBtn.disabled = !canSend();
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  }

  input.addEventListener('input', () => { autosize(); paintHint(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  sendBtn.addEventListener('click', send);
  // ── Attachments: 📎 button, drag and drop, paste ──
  async function addFiles(files) {
    const m = api.getModel(targetModelId(target));
    for (const file of files) {
      if (pending.length >= MAX_FILES) { toast(`Up to ${MAX_FILES} files per message`, { error: true }); break; }
      try { pending.push(await readFile(file, m)); }
      catch (err) { toast(err.message, { error: true }); }
    }
    paintAttachRow();
    paintHint();
    input.focus();
  }

  function paintAttachRow() {
    attachRow.hidden = !pending.length;
    attachRow.innerHTML = '';
    pending.forEach((a, i) => {
      const chip = a.kind === 'image'
        ? el(`<div class="attach-thumb"><img alt="${esc(a.name)}"><button class="attach-remove" aria-label="Remove ${esc(a.name)}"><i data-lucide="x"></i></button></div>`)
        : el(`<div class="file-chip"><i data-lucide="file-text"></i><span class="name">${esc(a.name)}</span><span class="size">${fmtBytes(new Blob([a.text]).size)}</span><button class="attach-remove inline" aria-label="Remove ${esc(a.name)}"><i data-lucide="x"></i></button></div>`);
      if (a.kind === 'image') $('img', chip).src = a.dataUrl;
      $('.attach-remove', chip).addEventListener('click', () => { pending.splice(i, 1); paintAttachRow(); paintHint(); input.focus(); });
      attachRow.appendChild(chip);
    });
    icons(attachRow);
  }

  attach.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { addFiles([...fileInput.files]); fileInput.value = ''; });
  input.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  let dragDepth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  main.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; dropOverlay.hidden = false; });
  main.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  main.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropOverlay.hidden = true; } });
  main.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    addFiles([...e.dataTransfer.files]);
  });
  $('[data-custom]', main).addEventListener('click', () => openCustom({ chat, target, draft: input.value, onCreditChanged }));

  async function send() {
    if (!canSend()) return;
    const text = input.value.trim();
    const files = pending;
    if (!chat) {
      const title = text || files.map(a => a.name).join(', ');
      chat = await api.createChat(target, title.length > 48 ? title.slice(0, 45) + '…' : title);
      history.replaceState(null, '', '#/chat/' + chat.id);
    }
    input.value = '';
    pending = [];
    paintAttachRow();
    autosize();
    await deliver(text, files);
  }

  async function deliver(text, files = [], opts = {}) {
    sending = true;
    paintHint();
    const p = api.sendMessage(chat.id, text, files, opts);
    paint();
    const typing = el(`<div class="msg-ai-wrap"><div class="typing" aria-label="Typing"><span></span><span></span><span></span></div></div>`);
    list.appendChild(typing);
    scroller.scrollTop = scroller.scrollHeight;
    onChatsChanged(chat.id);
    try {
      const { creditTokens } = await p;
      onCreditChanged(creditTokens);
      onChatsChanged(chat.id);
    } catch (err) {
      toast(err.message || 'Something went wrong', { error: true });
      // Give the text and files back so nothing is lost.
      if (!input.value.trim()) { input.value = text; autosize(); }
      if (!pending.length && files.length) { pending = files; paintAttachRow(); }
      // A brand-new chat whose first message failed shouldn't stay in RECENT.
      if (!chat.messages.length) {
        await api.deleteChat(chat.id).catch(() => {});
        chat = null;
        history.replaceState(null, '', '#/new');
        onChatsChanged();
      }
    }
    sending = false;
    paint();
    paintHint();
    input.focus();
  }

  // Asks the last question again. The server replaces the old question + answer.
  async function retry() {
    const lastUser = chat.messages.map(m => m.role).lastIndexOf('user');
    const { content, attachments = [] } = chat.messages[lastUser];
    chat.messages.splice(lastUser);
    await deliver(content, attachments, { retry: true });
  }

  paintModelBtn();
  paint();
  paintHint();
  icons(main);
  input.focus();
}

// Full-size view of an attached image. Click anywhere or press Esc to close.
function openImage(a) {
  const back = el(`<div class="modal-backdrop lightbox" role="dialog" aria-label="${esc(a.name)}"><img alt="${esc(a.name)}"><button class="icon-btn round lightbox-close" aria-label="Close"><i data-lucide="x"></i></button></div>`);
  $('img', back).src = a.dataUrl;
  const close = () => { back.remove(); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', close);
  document.addEventListener('keydown', key);
  document.body.appendChild(back);
  icons(back);
  $('.lightbox-close', back).focus();
}

// ── Picker dropdown ─────────────────────────────────────────────────────────

// Model picker dropdown. With modelsOnly, GPTs and recents are left out (used by the GPT editor).
export async function openPicker(anchor, recents, onPick, { modelsOnly = false } = {}) {
  const [catalog, mine, gpts] = await Promise.all([api.getCatalog(), api.getMyModels(), api.getGpts()]);
  const mineIds = new Set(mine.map(m => m.id));
  const ph = modelsOnly ? 'Search models' : 'Search models and GPTs';
  const pop = el(`<div class="picker" role="dialog" aria-label="Pick a model">
    <input class="input" placeholder="${ph}" aria-label="${ph}">
    <div class="picker-list" role="listbox"></div></div>`);
  const search = $('input', pop), list = $('.picker-list', pop);
  let rows = [], sel = 0;

  const row = t => {
    const d = describeTarget(t);
    const m = api.getModel(targetModelId(t));
    const b = el(`<button class="picker-row" role="option" tabindex="-1"><span class="prov-sq s24 p-${d.p}">${esc(d.name.charAt(0))}</span><span class="name">${esc(d.name)}</span><span class="mult">${fmtMult(m.mult)}</span></button>`);
    b.addEventListener('click', () => { close(); onPick(t); });
    b.addEventListener('mousemove', () => select(rows.indexOf(b)));
    return b;
  };

  function build() {
    const q = search.value.trim().toLowerCase();
    const match = t => !q || describeTarget(t).name.toLowerCase().includes(q) || api.getModel(targetModelId(t)).provider.toLowerCase().includes(q);
    const groups = [
      ['Recent', q || modelsOnly ? [] : recents],
      ['Your GPTs', modelsOnly ? [] : gpts.map(g => ({ kind: 'gpt', id: g.id })).filter(match)],
      ['Your models', mine.map(m => ({ kind: 'model', id: m.id })).filter(match)],
      // The rest of the catalog only shows up while searching.
      ['All models', q ? catalog.filter(m => !mineIds.has(m.id)).map(m => ({ kind: 'model', id: m.id })).filter(match) : []],
    ];
    list.innerHTML = '';
    rows = [];
    for (const [label, items] of groups) {
      if (!items.length) continue;
      list.appendChild(el(`<div class="section-label">${label}</div>`));
      for (const t of items) { const r = row(t); r._t = t; rows.push(r); list.appendChild(r); }
    }
    if (!rows.length) list.appendChild(el(`<div class="picker-row muted" style="pointer-events:none">No matches</div>`));
    select(0);
  }

  function select(i) {
    if (!rows.length) return;
    sel = (i + rows.length) % rows.length;
    rows.forEach((r, j) => { r.classList.toggle('is-selected', j === sel); r.setAttribute('aria-selected', j === sel); });
    rows[sel].scrollIntoView({ block: 'nearest' });
  }

  search.addEventListener('input', build);
  search.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); select(sel + 1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); select(sel - 1); }
    if (e.key === 'Enter' && rows[sel]) { e.preventDefault(); close(); onPick(rows[sel]._t); }
  });

  build();
  const close = openPopover(pop, anchor);
  search.focus();
}
