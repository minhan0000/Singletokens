// Sidebar: logo, New chat, navigation, recent chats grouped by model/GPT, account footer.

import { el, esc, icons, menu, modal, fmtShort, toast, $ } from './ui.js';
import * as api from './api.js';

// What a chat talks to, for labels and colors: { name, p (provider color key) }
export function describeTarget(target) {
  if (target.kind === 'gpt') {
    const g = api.getGpt(target.id);
    return { name: g.name, p: api.getModel(g.modelId).p };
  }
  const m = api.getModel(target.id);
  return { name: m.name, p: m.p };
}

const NAV = [
  { route: 'models', icon: 'layout-grid', label: 'Your models' },
  { route: 'gpts', icon: 'bot', label: 'Your GPTs' },
];

export function renderSidebar(root, { user, chats, route, chatId, go, onChatsChanged, onLogout, onSettings }) {
  root.innerHTML = '';
  root.append(
    el(`<div class="sidebar-logo">SingleTokens</div>`),
    button(`<button class="new-chat"><i data-lucide="plus"></i>New chat</button>`, () => go('#/new')),
    el(`<hr class="divider">`),
  );

  const scroll = el(`<nav class="sidebar-scroll" aria-label="Main"></nav>`);
  scroll.append(el(`<div class="section-label">Explore</div>`));
  for (const n of NAV) scroll.append(navLink(n, route === n.route, go));
  scroll.append(el(`<hr class="divider">`));
  scroll.append(navLink({ route: 'openrouter', icon: 'coins', label: 'OpenRouter credit' }, route === 'openrouter', go));
  scroll.append(el(`<hr class="divider">`));

  // RECENT: chats grouped under their model or GPT; groups ordered by their newest chat.
  scroll.append(el(`<div class="section-label">Recent</div>`));
  if (!chats.length) scroll.append(el(`<div class="nav-item" style="pointer-events:none"><span class="label">No chats yet</span></div>`));
  const groups = new Map();
  for (const c of chats) {
    const key = c.target.kind + ':' + c.target.id;
    if (!groups.has(key)) groups.set(key, { target: c.target, chats: [] });
    groups.get(key).chats.push(c);
  }
  for (const g of groups.values()) {
    const t = describeTarget(g.target);
    scroll.append(el(`<div class="section-label"><span class="prov-dot p-${t.p}"></span>${esc(t.name)}</div>`));
    for (const c of g.chats) scroll.append(chatLink(c, c.id === chatId, { go, onChatsChanged }));
  }
  root.append(scroll);

  // Footer: avatar, name, credit, menu.
  const footer = el(`<div class="sidebar-footer">
    <button class="account-btn" aria-haspopup="menu" aria-label="Account menu">
      <span class="avatar">${esc(user.name.charAt(0).toUpperCase())}</span>
      <span class="account-text"><div class="account-name">${esc(user.name)}</div><div class="account-sub">${user.openrouterConnected ? fmtShort(user.creditTokens) + ' ST' : 'Not connected'}</div></span>
      <i data-lucide="chevron-up" class="muted"></i>
    </button></div>`);
  const acct = $('.account-btn', footer);
  acct.addEventListener('click', () => {
    const m = menu([
      { icon: 'settings', label: 'Settings', onClick: onSettings },
      { icon: 'log-out', label: 'Log out', onClick: onLogout },
    ], acct);
    // Opens above the footer, full width of the sidebar footer.
    const r = acct.getBoundingClientRect();
    m.style.left = r.left + 'px';
    m.style.width = r.width + 'px';
    m.style.top = (r.top - 8 - m.offsetHeight) + 'px';
  });
  root.append(footer);
  icons(root);
}

function button(html, onClick) {
  const b = el(html);
  b.addEventListener('click', onClick);
  return b;
}

function navLink(n, active, go) {
  const a = el(`<a class="nav-item${active ? ' is-active' : ''}" href="#/${n.route}"${active ? ' aria-current="page"' : ''}><i data-lucide="${n.icon}"></i><span class="label">${esc(n.label)}</span></a>`);
  a.addEventListener('click', e => { e.preventDefault(); go('#/' + n.route); });
  return a;
}

function chatLink(chat, active, { go, onChatsChanged }) {
  const row = el(`<div class="nav-item${active ? ' is-active' : ''}">
    <a class="label" href="#/chat/${esc(chat.id)}"${active ? ' aria-current="page"' : ''}>${esc(chat.title)}</a>
    <button class="icon-btn item-menu" aria-label="Options for ${esc(chat.title)}"><i data-lucide="ellipsis"></i></button></div>`);
  row.addEventListener('click', e => {
    if (e.target.closest('.item-menu')) return;
    e.preventDefault();
    go('#/chat/' + chat.id);
  });
  const more = $('.item-menu', row);
  more.addEventListener('click', () => menu([
    { icon: 'pencil', label: 'Rename', onClick: () => renameDialog(chat, onChatsChanged) },
    { icon: 'trash-2', label: 'Delete', danger: true, onClick: () => deleteDialog(chat, { go, onChatsChanged, active }) },
  ], more));
  return row;
}

function renameDialog(chat, onChatsChanged) {
  const input = el(`<input class="input" aria-label="Chat name" maxlength="120">`);
  input.value = chat.title;
  const save = async close => {
    const title = input.value.trim();
    if (!title) return;
    await api.renameChat(chat.id, title);
    close();
    onChatsChanged();
  };
  const { close } = modal({ title: 'Rename chat', body: input, actions: [
    { label: 'Cancel', kind: 'ghost', onClick: c => c() },
    { label: 'Save', kind: 'primary', onClick: save },
  ] });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(close); });
  input.select();
}

function deleteDialog(chat, { go, onChatsChanged, active }) {
  modal({
    title: 'Delete chat',
    body: `<p style="margin:0;color:var(--text)">Delete <b>${esc(chat.title)}</b>? This can't be undone.</p>`,
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: c => c() },
      { label: 'Delete', kind: 'danger', onClick: async c => {
        await api.deleteChat(chat.id);
        c();
        toast('Chat deleted');
        if (active) go('#/new'); else onChatsChanged();
      } },
    ],
  });
}
