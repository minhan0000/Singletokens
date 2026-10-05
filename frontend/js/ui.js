// Small shared helpers: building elements, icons, numbers, Markdown, menus, toasts.

import { Marked } from 'https://cdn.jsdelivr.net/npm/marked@18.0.14/lib/marked.esm.js';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.4.16/dist/purify.es.mjs';

// ── Elements ────────────────────────────────────────────────────────────────

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Builds one element from an HTML string.
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Turns every <i data-lucide="..."> inside root into an SVG icon.
export function icons(root = document) {
  window.lucide?.createIcons({ root });
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ── Numbers ─────────────────────────────────────────────────────────────────

const TOKENS_PER_USD = 100000;

export const fmtInt = n => Math.round(n).toLocaleString('en-US');

// 250000 → "250K", 1200000 → "1.2M"
export function fmtShort(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(Math.round(n));
}

// SingleTokens → "~$0.71" or "<$0.01"
export function fmtUsd(tokens) {
  const usd = tokens / TOKENS_PER_USD;
  return usd < 0.01 ? '<$0.01' : '~$' + usd.toFixed(2);
}

export const fmtMult = m => m.toFixed(2) + 'x';

// ── Markdown (sanitized) ────────────────────────────────────────────────────

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }) {
      const label = esc(lang || 'text');
      return `<div class="code-block"><div class="code-head">${label}<button class="icon-btn sm" data-copy-code aria-label="Copy code"><i data-lucide="copy"></i></button></div><pre><code>${esc(text)}</code></pre></div>`;
    },
  },
});

export function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text), { ADD_ATTR: ['data-copy-code', 'data-lucide'] });
}

// ── Toasts ──────────────────────────────────────────────────────────────────

export function toast(message, { error = false } = {}) {
  let stack = $('.toast-stack');
  if (!stack) stack = document.body.appendChild(el('<div class="toast-stack" role="status" aria-live="polite"></div>'));
  const t = el(`<div class="toast${error ? ' is-error' : ''}">${esc(message)}</div>`);
  stack.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch { toast('Could not copy', { error: true }); }
}

// ── Popovers (menus, picker) ────────────────────────────────────────────────

// Opens a popover element; closes it on outside click or Esc. Returns a close function.
export function openPopover(pop, anchor, { onClose } = {}) {
  closePopovers();
  pop.dataset.popover = '';
  document.body.appendChild(pop);
  position(pop, anchor);
  const close = () => {
    pop.remove();
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', key, true);
    onClose?.();
  };
  const outside = e => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); close(); anchor.focus(); } };
  document.addEventListener('mousedown', outside, true);
  document.addEventListener('keydown', key, true);
  pop._close = close;
  return close;
}

export function closePopovers() {
  $$('[data-popover]').forEach(p => p._close?.());
}

// Places the popover under the anchor, or above it if there's no room below.
function position(pop, anchor) {
  const a = anchor.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.zIndex = 45;
  const p = pop.getBoundingClientRect();
  const below = a.bottom + 8 + p.height <= window.innerHeight;
  pop.style.top = (below ? a.bottom + 8 : Math.max(8, a.top - 8 - p.height)) + 'px';
  pop.style.left = Math.max(8, Math.min(a.left, window.innerWidth - p.width - 8)) + 'px';
}

// A simple menu: items = [{ icon, label, danger, onClick }]
export function menu(items, anchor) {
  const m = el(`<div class="menu" role="menu"></div>`);
  for (const it of items) {
    const b = el(`<button class="menu-item${it.danger ? ' is-danger' : ''}" role="menuitem"><i data-lucide="${it.icon}"></i>${esc(it.label)}</button>`);
    b.addEventListener('click', () => { close(); it.onClick(); });
    m.appendChild(b);
  }
  icons(m);
  const close = openPopover(m, anchor);
  m.querySelector('button')?.focus();
  m.addEventListener('keydown', e => {
    const btns = $$('.menu-item', m), i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
  });
  return m;
}

// ── Modal ───────────────────────────────────────────────────────────────────

export function modal({ title, body, actions = [], width }) {
  const back = el(`<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"${width ? ` style="max-width:${width}px"` : ''}>
    <h3 class="modal-title">${esc(title)}</h3>
    <button class="icon-btn modal-close" aria-label="Close"><i data-lucide="x"></i></button>
    <div class="modal-body"></div><div class="modal-actions"></div></div></div>`);
  const box = $('.modal', back);
  if (typeof body === 'string') $('.modal-body', back).innerHTML = body; else $('.modal-body', back).appendChild(body);
  for (const a of actions) {
    const b = el(`<button class="btn btn-${a.kind || 'secondary'}">${esc(a.label)}</button>`);
    b.addEventListener('click', () => a.onClick(close));
    $('.modal-actions', back).appendChild(b);
  }
  if (!actions.length) $('.modal-actions', back).remove();
  const prev = document.activeElement;
  const close = () => { back.remove(); document.removeEventListener('keydown', key); prev?.focus?.(); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  $('.modal-close', back).addEventListener('click', close);
  document.body.appendChild(back);
  icons(back);
  (box.querySelector('input, textarea, button.btn-primary') || box).focus();
  return { close, root: back };
}

// ── JSON with syntax colors ─────────────────────────────────────────────────

// Returns HTML: keys, strings, numbers and true/false/null wrapped in colored spans.
export function highlightJson(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return esc(text).replace(/(&quot;(?:\\u[a-fA-F0-9]{4}|\\[^u]|(?!&quot;).)*?&quot;)(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (m, str, colon, lit) => {
    if (str) return colon ? `<span class="j-key">${str}</span>:` : `<span class="j-str">${str}</span>`;
    if (lit) return `<span class="j-lit">${m}</span>`;
    return `<span class="j-num">${m}</span>`;
  });
}
