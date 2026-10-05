// Settings: a Discord-style modal with Appearance (theme) and Account.

import { el, esc, icons, $, $$, modal, toast } from './ui.js';
import * as api from './api.js';

const MIN_PASSWORD = 12;

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('st_theme', theme); } catch {}
}
const currentTheme = () => document.documentElement.dataset.theme || 'dark';

export async function openSettings({ section = 'appearance', onUserChanged } = {}) {
  let user = await api.getUser();
  const prevFocus = document.activeElement;

  const back = el(`<div class="modal-backdrop settings-backdrop">
    <div class="modal settings" role="dialog" aria-modal="true" aria-label="Settings">
      <nav class="settings-nav" aria-label="Settings sections">
        <div class="section-label">User settings</div>
        <button class="nav-item" data-section="appearance"><i data-lucide="palette"></i><span class="label">Appearance</span></button>
        <button class="nav-item" data-section="account"><i data-lucide="user"></i><span class="label">Account</span></button>
        <div class="settings-legal"><a href="/impressum.html" target="_blank" rel="noopener">Impressum</a> · <a href="/privacy.html" target="_blank" rel="noopener">Privacy</a></div>
      </nav>
      <div class="settings-content">
        <button class="icon-btn modal-close" aria-label="Close settings"><i data-lucide="x"></i></button>
        <div class="settings-panel"></div>
      </div>
    </div></div>`);
  const panel = $('.settings-panel', back);

  function show(name) {
    section = name;
    $$('[data-section]', back).forEach(b => {
      b.classList.toggle('is-active', b.dataset.section === name);
      b.setAttribute('aria-current', b.dataset.section === name ? 'page' : 'false');
    });
    panel.innerHTML = '';
    panel.appendChild(name === 'appearance' ? appearance() : account());
    icons(panel);
  }
  $$('[data-section]', back).forEach(b => b.addEventListener('click', () => show(b.dataset.section)));

  // ── Appearance ──
  function appearance() {
    const box = el(`<div><h2>Appearance</h2>
      <div class="field-label">Theme</div>
      <div class="theme-tiles" role="radiogroup" aria-label="Theme"></div></div>`);
    for (const [value, label, cls] of [['dark', 'Dark', 'tp-dark'], ['white', 'White', 'tp-white']]) {
      const on = currentTheme() === value;
      const tile = el(`<button class="theme-tile${on ? ' is-selected' : ''}" role="radio" aria-checked="${on}">
        <div class="theme-preview ${cls}"><div class="tp-side"></div><div class="tp-main"><div class="tp-bubble me"></div><div class="tp-bubble ai"></div><div class="tp-input"></div></div></div>${label}</button>`);
      tile.addEventListener('click', () => { setTheme(value); show('appearance'); $(`.theme-tile[aria-checked="true"]`, panel)?.focus(); });
      $('.theme-tiles', box).appendChild(tile);
    }
    return box;
  }

  // ── Account ──
  function account() {
    const box = el(`<div><h2>Account</h2><div class="acct-rows"></div>
      <div class="danger-zone"><div class="info"><div class="title">Delete account</div>
        <div class="sub">Deletes your chats, GPTs, models and OpenRouter connection. This can't be undone.</div></div>
        <button class="btn btn-danger" data-delete>Delete account</button></div></div>`);
    const rows = $('.acct-rows', box);
    const add = (label, value, form) => rows.appendChild(row(label, value, form));
    add('Name', esc(user.name), () => [
      { id: 'set-name', label: 'Name', value: user.name, autocomplete: 'name' },
    ]);
    add('Email', esc(user.email), () => [
      { id: 'set-email', label: 'New email', type: 'email', value: user.email, autocomplete: 'email' },
      { id: 'set-email-pw', label: 'Current password', type: 'password', autocomplete: 'current-password' },
    ]);
    add('Password', '••••••••••••', () => [
      { id: 'set-pw-cur', label: 'Current password', type: 'password', autocomplete: 'current-password' },
      { id: 'set-pw-new', label: 'New password', type: 'password', autocomplete: 'new-password', note: `At least ${MIN_PASSWORD} characters.` },
    ]);
    $('[data-delete]', box).addEventListener('click', confirmDelete);
    return box;
  }

  // One account row. "Edit" turns it into a small inline form.
  function row(label, valueHtml, fields) {
    const r = el(`<div class="acct-row"><div class="info"><div class="label">${label}</div><div class="value">${valueHtml}</div></div>
      <button class="btn btn-secondary" data-edit>Edit</button></div>`);
    $('[data-edit]', r).addEventListener('click', () => {
      $$('.acct-edit', panel).forEach(f => f._cancel());
      const form = el(`<form class="acct-row acct-edit" novalidate><div class="info">
        ${fields().map(f => `<div class="field"><label class="field-label" for="${f.id}">${f.label}</label>
          <input class="input" id="${f.id}" type="${f.type || 'text'}" autocomplete="${f.autocomplete}" value="${esc(f.value || '')}">
          ${f.note ? `<div class="field-note">${f.note}</div>` : ''}</div>`).join('')}
        <div class="field-error" hidden></div></div>
        <div class="acct-edit-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn btn-primary">Save</button></div></form>`);
      form._cancel = () => form.replaceWith(r);
      $('[data-cancel]', form).addEventListener('click', () => { form._cancel(); $('[data-edit]', r).focus(); });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const err = $('.field-error', form), btn = $('[type="submit"]', form);
        const setErr = m => { err.textContent = m; err.hidden = !m; };
        setErr('');
        btn.disabled = true;
        try {
          await save(label, form);
          user = await api.getUser();
          await onUserChanged?.();
          toast(`${label} updated`);
          show('account');
        } catch (ex) { setErr(ex.message); btn.disabled = false; }
      });
      r.replaceWith(form);
      $('input', form).focus();
      $('input', form).select?.();
    });
    return r;
  }

  async function save(label, form) {
    const v = id => $('#' + id, form).value;
    if (label === 'Name') {
      if (!v('set-name').trim()) throw new Error('Enter a name.');
      await api.updateName(v('set-name').trim());
    } else if (label === 'Email') {
      if (!/^\S+@\S+\.\S+$/.test(v('set-email'))) throw new Error('Enter a valid email address.');
      if (!v('set-email-pw')) throw new Error('Enter your current password to confirm.');
      await api.updateEmail(v('set-email').trim(), v('set-email-pw'));
    } else {
      if (!v('set-pw-cur')) throw new Error('Enter your current password.');
      if (v('set-pw-new').length < MIN_PASSWORD) throw new Error(`New password must be at least ${MIN_PASSWORD} characters.`);
      await api.updatePassword(v('set-pw-cur'), v('set-pw-new'));
    }
  }

  // Deleting needs the word DELETE typed in, so it can't happen by accident.
  function confirmDelete() {
    const body = el(`<div>
      <p style="margin:0 0 var(--sp-16);color:var(--text)">This permanently deletes your account, chats, GPTs, models and your OpenRouter connection.
        Your OpenRouter credit stays on OpenRouter.</p>
      <label class="field-label" for="del-confirm">Type DELETE to confirm</label>
      <input class="input" id="del-confirm" autocomplete="off" spellcheck="false"></div>`);
    const { root, close } = modal({ title: 'Delete account', body, actions: [
      { label: 'Cancel', kind: 'ghost', onClick: c => c() },
      { label: 'Delete account', kind: 'danger', onClick: async () => {
        await api.deleteAccount();
        try { localStorage.removeItem('st_token'); localStorage.removeItem('st_user'); } catch {}
        location.href = '/login.html#signup';
      } },
    ] });
    const input = $('#del-confirm', root), btn = $('.btn-danger', root);
    btn.disabled = true;
    input.addEventListener('input', () => { btn.disabled = input.value !== 'DELETE'; });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !btn.disabled) btn.click(); });
    input.focus();
    return close;
  }

  // ── Open / close ──
  function close() {
    back.remove();
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
  }
  function onKey(e) {
    // Esc closes only the top-most dialog.
    if (e.key === 'Escape' && $$('.modal-backdrop').at(-1) === back) close();
  }
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  $('.modal-close', back).addEventListener('click', close);
  document.body.appendChild(back);
  show(section);
  icons(back);
  $(`[data-section="${section}"]`, back).focus();
}
