// Your Models: balance card, one card per model, "+ Add Model" with the catalog modal.

import { el, esc, icons, $, $$, fmtShort, fmtMult, menu, modal, toast } from './ui.js';
import * as api from './api.js';

const fmtContext = n => (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : Math.round(n / 1e3) + 'K') + ' context';

export async function renderModels(main, { user, openDrawer }) {
  main.innerHTML = `
    <div class="topbar only-phone"><button class="icon-btn" data-drawer aria-label="Open menu"><i data-lucide="menu"></i></button></div>
    <div class="page-scroll"><div class="page">
      <h1 class="page-title">Your Models</h1>
      <p class="page-sub">Manage your AI models and token balance</p>
      <div class="card-grid"></div>
      <button class="add-btn"><i data-lucide="plus"></i>Add Model</button>
    </div></div>`;
  $('[data-drawer]', main).addEventListener('click', openDrawer);
  $('.add-btn', main).addEventListener('click', () => openCatalog(paint));
  const grid = $('.card-grid', main);

  async function paint() {
    const mine = await api.getMyModels();
    grid.innerHTML = '';
    grid.appendChild(balanceCard(user));
    for (const m of mine) grid.appendChild(modelCard(m, paint));
    icons(main);
  }
  await paint();
}

function balanceCard(user) {
  const value = user.openrouterConnected && user.creditKnown !== false ? fmtShort(user.creditTokens) : '—';
  return el(`<div class="balance-card">
    <div class="card-head"><span class="balance-icon" aria-hidden="true">ST</span><div><div class="card-name">SingleTokens Balance</div><div class="card-provider">Universal tokens for all models</div></div></div>
    <div class="cost-box"><div class="cost-label">Available SingleTokens</div><div class="cost-value">${value}</div></div></div>`);
}

function modelCard(m, repaint) {
  const card = el(`<div class="model-card">
    <button class="icon-btn sm card-menu" aria-label="Options for ${esc(m.name)}"><i data-lucide="ellipsis"></i></button>
    <div class="card-head"><span class="prov-sq s48 p-${m.p}" aria-hidden="true">${esc(m.name.charAt(0))}</span><div><div class="card-name">${esc(m.name)}</div><div class="card-provider">${esc(m.provider)}</div></div></div>
    <div class="cost-box"><div class="cost-label">Token cost</div><div class="cost-value">${fmtMult(m.mult)}</div></div></div>`);
  const btn = $('.card-menu', card);
  btn.addEventListener('click', () => menu([
    { icon: 'trash-2', label: 'Remove', danger: true, onClick: () => confirmRemove(m, repaint) },
  ], btn));
  return card;
}

function confirmRemove(m, repaint) {
  modal({
    title: 'Remove model',
    body: `<p style="margin:0;color:var(--text)">Remove <b>${esc(m.name)}</b> from your models? Your chats with it stay, and you can add it back any time.</p>`,
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: c => c() },
      { label: 'Remove', kind: 'danger', onClick: async c => { try { await api.removeMyModel(m.id); } catch (err) { return toast(err.message, { error: true }); } c(); toast(`${m.name} removed`); repaint(); } },
    ],
  });
}

// ── Catalog modal ───────────────────────────────────────────────────────────

async function openCatalog(onChange) {
  const [catalog, mine] = await Promise.all([api.getCatalog(), api.getMyModels()]);
  const added = new Set(mine.map(m => m.id));
  const providers = [...new Map(catalog.map(m => [m.provider, m.p])).entries()];
  let provider = null;

  const body = el(`<div>
    <input class="input" placeholder="Search ${catalog.length} models" aria-label="Search models">
    <div class="chips" role="group" aria-label="Filter by provider"></div>
    <div class="catalog-list"></div></div>`);
  const search = $('input', body), chips = $('.chips', body), list = $('.catalog-list', body);

  const chip = (label, value, p) => {
    const c = el(`<button class="chip" aria-pressed="false">${p ? `<span class="prov-dot p-${p}"></span>` : ''}${esc(label)}</button>`);
    c.addEventListener('click', () => { provider = value; paint(); });
    c._value = value;
    return c;
  };
  chips.appendChild(chip('All', null));
  for (const [name, p] of providers) chips.appendChild(chip(name, name, p));

  function paint() {
    $$('.chip', chips).forEach(c => {
      const on = c._value === provider;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-pressed', on);
    });
    const q = search.value.trim().toLowerCase();
    const rows = catalog.filter(m => (!provider || m.provider === provider) && (!q || (m.name + ' ' + m.provider).toLowerCase().includes(q)));
    list.innerHTML = rows.length ? '' : `<p class="muted" style="margin:0;padding:var(--sp-16) var(--sp-8)">No models match.</p>`;
    for (const m of rows) list.appendChild(row(m));
    icons(list);
  }

  function row(m) {
    const has = added.has(m.id);
    const r = el(`<div class="catalog-row">
      <span class="prov-sq s32 p-${m.p}" aria-hidden="true">${esc(m.name.charAt(0))}</span>
      <div class="info"><div class="name">${esc(m.name)}</div><div class="sub">${esc(m.provider)} · ${fmtContext(m.context)}</div></div>
      <span class="mult">${fmtMult(m.mult)}</span>
      ${has ? `<button class="btn btn-added" disabled aria-label="${esc(m.name)} added"><i data-lucide="check"></i>Added</button>`
            : `<button class="btn btn-primary" aria-label="Add ${esc(m.name)}">Add</button>`}</div>`);
    if (!has) $('.btn', r).addEventListener('click', async () => {
      try { await api.addMyModel(m.id); } catch (err) { return toast(err.message, { error: true }); }
      added.add(m.id);
      onChange();
      const fresh = row(m);
      r.replaceWith(fresh);
      icons(fresh);
    });
    return r;
  }

  search.addEventListener('input', paint);
  paint();
  const { root } = modal({ title: 'Add a model', body, width: 640 });
  // Fixed height so the modal doesn't jump when a filter changes the list length.
  $('.modal', root).style.height = 'min(600px, calc(100vh - 32px))';
  search.focus();
}
