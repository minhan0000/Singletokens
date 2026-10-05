// Your GPTs: the grid of bots, and the full-page editor.

import { el, esc, icons, $, $$, fmtInt, fmtMult, menu, modal, toast } from './ui.js';
import { openPicker } from './chat.js';
import * as api from './api.js';

const TOKENS_PER_USD = 100000;
const roughTokens = t => Math.ceil(String(t).length / 4);
const firstGrapheme = s => [...new Intl.Segmenter().segment(s.trim())][0]?.segment || '';

// The square icon: the chosen emoji, or the name's first letter.
const iconHtml = g => `<span class="gpt-icon" aria-hidden="true">${esc(g.icon || g.name.charAt(0).toUpperCase() || '?')}</span>`;

// ── Grid ────────────────────────────────────────────────────────────────────

export async function renderGpts(main, { go, openDrawer, onChatsChanged }) {
  main.innerHTML = `
    <div class="topbar only-phone"><button class="icon-btn" data-drawer aria-label="Open menu"><i data-lucide="menu"></i></button></div>
    <div class="page-scroll"><div class="page">
      <h1 class="page-title">Your GPTs</h1>
      <p class="page-sub">Bots with their own instructions, memory and settings</p>
      <div class="card-grid"></div>
    </div></div>`;
  $('[data-drawer]', main).addEventListener('click', openDrawer);
  const grid = $('.card-grid', main);

  const add = el(`<button class="add-card"><i data-lucide="plus"></i>New GPT</button>`);
  add.addEventListener('click', () => go('#/gpt/new'));
  grid.appendChild(add);

  for (const g of await api.getGpts()) {
    const m = api.getModel(g.modelId);
    const card = el(`<div class="model-card gpt-card" role="link" tabindex="0" aria-label="Chat with ${esc(g.name)}">
      <button class="icon-btn sm card-menu" aria-label="Options for ${esc(g.name)}"><i data-lucide="ellipsis"></i></button>
      <div class="card-head">${iconHtml(g)}<div class="card-name">${esc(g.name)}</div></div>
      <span class="model-pill"><span class="prov-dot p-${m.p}"></span>${esc(m.name)}</span>
      <p class="gpt-desc">${esc(g.description || 'No description')}</p></div>`);
    // Clicking a card starts a new chat with that GPT.
    const open = () => go('#/new/' + g.id);
    card.addEventListener('click', e => { if (!e.target.closest('.card-menu')) open(); });
    card.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === card) open(); });
    const btn = $('.card-menu', card);
    btn.addEventListener('click', () => menu([
      { icon: 'pencil', label: 'Edit', onClick: () => go('#/gpt/' + g.id) },
      { icon: 'trash-2', label: 'Delete', danger: true, onClick: () => confirmDelete(g, () => { onChatsChanged(); renderGpts(main, { go, openDrawer, onChatsChanged }); }) },
    ], btn));
    grid.appendChild(card);
  }
  icons(main);
}

function confirmDelete(g, done) {
  modal({
    title: 'Delete GPT',
    body: `<p style="margin:0;color:var(--text)">Delete <b>${esc(g.name)}</b>? Its chats stay and continue with ${esc(api.getModel(g.modelId).name)}. This can't be undone.</p>`,
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: c => c() },
      { label: 'Delete', kind: 'danger', onClick: async c => { await api.deleteGpt(g.id); c(); toast(`${g.name} deleted`); done(); } },
    ],
  });
}

// ── Editor ──────────────────────────────────────────────────────────────────

const ADVANCED = [
  { key: 'top_p', label: 'Top P', min: 0, max: 1, step: 0.05, hint: 'Only consider the most likely words that add up to this share. 1 = all.' },
  { key: 'top_k', label: 'Top K', min: 1, max: 500, step: 1, hint: 'Only consider this many of the most likely next words.' },
  { key: 'frequency_penalty', label: 'Frequency penalty', min: -2, max: 2, step: 0.1, hint: 'Above 0 makes repeating the same words less likely.' },
  { key: 'presence_penalty', label: 'Presence penalty', min: -2, max: 2, step: 0.1, hint: 'Above 0 pushes the model toward new topics.' },
];

export async function renderGptEditor(main, { id, go, openDrawer, onChatsChanged }) {
  const existing = id && id !== 'new' ? api.getGpt(id) : null;
  if (id && id !== 'new' && !existing) return go('#/gpts');
  const g = existing ? structuredClone(existing) : api.newGptDraft();

  main.innerHTML = `
    <div class="topbar only-phone"><button class="icon-btn" data-drawer aria-label="Open menu"><i data-lucide="menu"></i></button></div>
    <div class="page-scroll">
      <form class="page form" novalidate>
        <h1 class="page-title">${existing ? 'Edit GPT' : 'New GPT'}</h1>
        <p class="page-sub">${existing ? esc(existing.name) : 'A bot with its own instructions, memory and settings'}</p>

        <section class="form-section">
          <h2>Basics</h2>
          <div class="field"><label class="field-label" for="g-name">Name</label>
            <input class="input" id="g-name" maxlength="60" placeholder="e.g. Study Buddy" value="${esc(g.name)}">
            <div class="field-error" hidden></div></div>
          <div class="field"><label class="field-label" for="g-icon">Icon</label>
            <div class="icon-field"><span class="icon-preview"></span>
              <input class="input" id="g-icon" placeholder="One emoji, or leave empty for the first letter" value="${esc(g.icon)}"></div></div>
          <div class="field"><label class="field-label" for="g-desc">Description</label>
            <input class="input" id="g-desc" maxlength="160" placeholder="What does it do? Shown on its card." value="${esc(g.description)}"></div>
        </section>

        <section class="form-section">
          <h2>Model</h2>
          <button type="button" class="input model-select" aria-haspopup="listbox"></button>
        </section>

        <section class="form-section">
          <h2>Instructions</h2>
          <div class="field counted"><textarea class="input" id="g-instr" style="min-height:160px" placeholder="How should it behave? e.g. &quot;You are a patient French tutor…&quot;" aria-label="Instructions">${esc(g.instructions)}</textarea>
            <span class="counter"></span>
            <div class="field-error" hidden></div></div>
        </section>

        <section class="form-section">
          <h2>Memory</h2>
          <p class="field-note" style="margin:0 0 var(--sp-12)">Facts the GPT should always know, written as JSON. Sent with every message.</p>
          <div class="code-editor"><div class="code-gutter" aria-hidden="true"></div>
            <textarea id="g-memory" spellcheck="false" aria-label="Memory (JSON)" placeholder='{ "name": "Edo" }'>${esc(g.memory)}</textarea></div>
          <div class="field-error" hidden></div>
          <div class="field-note" data-mem-cost></div>
        </section>

        <section class="form-section">
          <h2>Settings</h2>
          <div class="field"><label class="field-label" for="g-temp">Temperature</label>
            <div class="slider-row"><input type="range" class="slider" id="g-temp-range" min="0" max="2" step="0.1" aria-label="Temperature">
              <input class="input" id="g-temp" type="number" min="0" max="2" step="0.1"></div>
            <div class="field-note">Lower = focused and predictable. Higher = more creative and random.</div></div>
          <div class="field"><label class="field-label" for="g-max">Max tokens</label>
            <input class="input" id="g-max" type="number" min="1" step="1" placeholder="Model default" style="max-width:200px" value="${g.settings.max_tokens ?? ''}">
            <div class="field-note">The longest reply allowed. Leave empty for the model's default.</div></div>
          <button type="button" class="btn btn-ghost advanced-toggle" aria-expanded="false"><i data-lucide="chevron-right"></i>Advanced</button>
          <div class="advanced" hidden></div>
        </section>

        ${existing ? `<section class="form-section"><button type="button" class="btn btn-danger" data-delete><i data-lucide="trash-2"></i>Delete GPT</button></section>` : ''}
      </form>
      <div class="form-footer"><button type="button" class="btn btn-secondary" data-cancel>Cancel</button><button type="button" class="btn btn-primary" data-save>Save</button></div>
    </div>`;

  $('[data-drawer]', main).addEventListener('click', openDrawer);
  const form = $('form', main);
  const name = $('#g-name', main), iconIn = $('#g-icon', main), desc = $('#g-desc', main);
  const instr = $('#g-instr', main), mem = $('#g-memory', main), gutter = $('.code-gutter', main);
  const temp = $('#g-temp', main), tempRange = $('#g-temp-range', main), maxTok = $('#g-max', main);
  const modelBtn = $('.model-select', main), adv = $('.advanced', main), advToggle = $('.advanced-toggle', main);

  // ── Basics ──
  const paintIcon = () => {
    g.icon = firstGrapheme(iconIn.value);
    g.name = name.value;
    $('.icon-preview', main).innerHTML = iconHtml(g);
  };
  iconIn.addEventListener('input', paintIcon);
  name.addEventListener('input', () => { paintIcon(); setError(name, ''); });

  // ── Model ──
  const paintModel = () => {
    const m = api.getModel(g.modelId);
    modelBtn.innerHTML = `<span class="prov-sq p-${m.p}">${esc(m.name.charAt(0))}</span><span class="grow">${esc(m.name)}</span><span class="mult">${fmtMult(m.mult)}</span><i data-lucide="chevron-down" class="muted"></i>`;
    modelBtn.setAttribute('aria-label', `Model: ${m.name}. Change model`);
    icons(modelBtn);
    paintAdvanced();
    paintMemory();
    paintCounter();
  };
  modelBtn.addEventListener('click', () => openPicker(modelBtn, [], t => { g.modelId = t.id; paintModel(); modelBtn.focus(); }, { modelsOnly: true }));

  // ── Instructions ──
  const paintCounter = () => {
    const m = api.getModel(g.modelId), t = roughTokens(instr.value);
    $('.counter', main).textContent = `~${fmtInt(t)} tokens · adds ~${fmtInt(Math.ceil(t * m.promptUsd * TOKENS_PER_USD))} SingleTokens per message`;
  };
  instr.addEventListener('input', () => { paintCounter(); setError(instr, ''); });

  // ── Memory (JSON) ──
  function paintMemory() {
    const lines = mem.value.split('\n').length;
    gutter.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
    gutter.scrollTop = mem.scrollTop;
    const err = jsonError(mem.value);
    $('.code-editor', main).classList.toggle('is-error', !!err);
    setError(mem.closest('.form-section').querySelector('.code-editor'), err || '');
    const m = api.getModel(g.modelId), t = mem.value.trim() ? roughTokens(mem.value) : 0;
    $('[data-mem-cost]', main).textContent = `Adds ~${fmtInt(Math.ceil(t * m.promptUsd * TOKENS_PER_USD))} SingleTokens to every message`;
  }
  mem.addEventListener('input', paintMemory);
  mem.addEventListener('scroll', () => { gutter.scrollTop = mem.scrollTop; });
  mem.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); mem.setRangeText('  ', mem.selectionStart, mem.selectionEnd, 'end'); paintMemory(); }
  });

  // ── Settings ──
  const setTemp = v => { const n = Math.min(2, Math.max(0, Number(v) || 0)); g.settings.temperature = n; temp.value = n; tempRange.value = n; };
  setTemp(g.settings.temperature);
  tempRange.addEventListener('input', () => setTemp(tempRange.value));
  temp.addEventListener('change', () => setTemp(temp.value));
  maxTok.addEventListener('input', () => { g.settings.max_tokens = maxTok.value ? Math.max(1, Math.round(maxTok.value)) : null; });

  advToggle.addEventListener('click', () => {
    const open = adv.hidden;
    adv.hidden = !open;
    advToggle.setAttribute('aria-expanded', open);
    advToggle.classList.toggle('is-open', open);
  });

  // Only the settings the chosen model accepts are shown.
  function paintAdvanced() {
    const m = api.getModel(g.modelId);
    adv.innerHTML = '';
    for (const p of ADVANCED.filter(p => m.params.includes(p.key))) {
      const f = el(`<div class="field"><label class="field-label" for="g-${p.key}">${p.label}</label>
        <input class="input" id="g-${p.key}" type="number" min="${p.min}" max="${p.max}" step="${p.step}" placeholder="Model default" style="max-width:200px" value="${g.settings[p.key] ?? ''}">
        <div class="field-note">${p.hint}</div></div>`);
      $('input', f).addEventListener('input', e => { g.settings[p.key] = e.target.value === '' ? null : Number(e.target.value); });
      adv.appendChild(f);
    }
    if (m.params.includes('stop')) adv.appendChild(stopField());
    const hidden = ADVANCED.filter(p => !m.params.includes(p.key)).map(p => p.label);
    if (hidden.length) adv.appendChild(el(`<p class="field-note">${esc(m.name)} doesn't support: ${hidden.join(', ')}.</p>`));
  }

  function stopField() {
    const f = el(`<div class="field"><label class="field-label" for="g-stop">Stop sequences</label>
      <div class="tag-input"><input id="g-stop" placeholder="Type and press Enter"></div>
      <div class="field-note">The reply stops as soon as the model writes one of these.</div></div>`);
    const box = $('.tag-input', f), input = $('input', f);
    const paint = () => {
      $$('.tag', box).forEach(t => t.remove());
      g.settings.stop.forEach((s, i) => {
        const tag = el(`<span class="tag">${esc(s)}<button type="button" aria-label="Remove ${esc(s)}"><i data-lucide="x"></i></button></span>`);
        $('button', tag).addEventListener('click', () => { g.settings.stop.splice(i, 1); paint(); input.focus(); });
        box.insertBefore(tag, input);
      });
      icons(box);
    };
    input.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ',') && input.value) {
        e.preventDefault();
        if (g.settings.stop.length < 4 && !g.settings.stop.includes(input.value)) g.settings.stop.push(input.value);
        else if (g.settings.stop.length >= 4) toast('Up to 4 stop sequences', { error: true });
        input.value = '';
        paint();
      } else if (e.key === 'Backspace' && !input.value && g.settings.stop.length) {
        g.settings.stop.pop();
        paint();
      }
    });
    box.addEventListener('click', e => { if (e.target === box) input.focus(); });
    paint();
    return f;
  }

  // ── Save / cancel / delete ──
  $('[data-cancel]', main).addEventListener('click', () => go('#/gpts'));
  $('[data-save]', main).addEventListener('click', save);
  form.addEventListener('submit', e => { e.preventDefault(); save(); });
  $('[data-delete]', main)?.addEventListener('click', () => confirmDelete(existing, () => { onChatsChanged(); go('#/gpts'); }));

  async function save() {
    let firstBad = null;
    const check = (input, msg) => { setError(input, msg); if (msg && !firstBad) firstBad = input; };
    check(name, name.value.trim() ? '' : 'Give your GPT a name.');
    check(instr, instr.value.trim() ? '' : 'Write some instructions so it knows how to behave.');
    if (jsonError(mem.value)) firstBad ||= mem;
    if (firstBad) { firstBad.focus(); return; }
    Object.assign(g, { name: name.value.trim(), icon: firstGrapheme(iconIn.value), description: desc.value.trim(), instructions: instr.value.trim(), memory: mem.value.trim() });
    await api.saveGpt(g);
    toast(existing ? 'GPT saved' : `${g.name} created`);
    onChatsChanged();
    go('#/gpts');
  }

  paintIcon();
  paintModel();
  icons(main);
  (existing ? instr : name).focus();
}

// Shows or clears the red message under a field.
function setError(input, msg) {
  const field = input.closest('.field, .form-section');
  const box = field.querySelector('.field-error');
  input.classList.toggle('is-error', !!msg);
  input.setAttribute('aria-invalid', !!msg);
  box.hidden = !msg;
  box.textContent = msg;
}

// "" when the JSON is fine (or empty), otherwise a message with the line number.
function jsonError(text) {
  if (!text.trim()) return '';
  try { JSON.parse(text); return ''; }
  catch (e) {
    const m = /line (\d+)/.exec(e.message) || /position (\d+)/.exec(e.message);
    let line = m ? Number(m[1]) : null;
    if (m && m[0].startsWith('position')) line = text.slice(0, line).split('\n').length;
    const why = e.message.replace(/^JSON\.parse: /, '').replace(/ in JSON at position.*$/, '').replace(/\s*\(line.*$/, '');
    return line ? `Invalid JSON on line ${line}: ${why}` : `Invalid JSON: ${why}`;
  }
}
