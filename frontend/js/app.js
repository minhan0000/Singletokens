// App entry: theme, routing between screens, sidebar + phone drawer.

import { $, el, toast, closePopovers } from './ui.js';
import { renderSidebar } from './sidebar.js';
import { renderChat } from './chat.js';
import * as api from './api.js';

// Theme: saved choice, dark by default.
try { document.documentElement.dataset.theme = localStorage.getItem('st_theme') || 'dark'; } catch {}

const app = $('.app');
const sidebar = $('.sidebar');
const main = $('.main');

const state = { user: null, chats: [], route: 'new', chatId: null };

function parseRoute() {
  const [, route = 'new', id = null] = location.hash.split('/');
  return { route: route || 'new', id };
}

const go = hash => { if (location.hash === hash) render(); else location.hash = hash; };

function closeDrawer() { app.classList.remove('drawer-open'); }
function openDrawer() { app.classList.add('drawer-open'); $('.new-chat', sidebar)?.focus(); }

function paintSidebar() {
  renderSidebar(sidebar, {
    user: state.user,
    chats: state.chats,
    route: state.route,
    chatId: state.chatId,
    go: hash => { closeDrawer(); go(hash); },
    onChatsChanged: refreshChats,
    onSettings: () => toast('Settings are built in a later step.'),
    onLogout: () => toast('Log out gets connected with the backend.'),
  });
}

async function refreshChats(activeId) {
  state.chats = await api.getChats();
  if (activeId) state.chatId = activeId;
  paintSidebar();
}

async function render() {
  closePopovers();
  closeDrawer();
  const { route, id } = parseRoute();
  state.route = route;
  state.chatId = route === 'chat' ? id : null;
  paintSidebar();

  if (route === 'chat' || route === 'new') {
    await renderChat(main, {
      chatId: state.chatId,
      user: state.user,
      go,
      openDrawer,
      onChatsChanged: refreshChats,
      onCreditChanged: credit => { state.user.creditTokens = credit; paintSidebar(); },
    });
  } else {
    // Screens built in later steps.
    main.innerHTML = `<div class="topbar"><button class="icon-btn only-phone" data-drawer aria-label="Open menu"><i data-lucide="menu"></i></button></div>
      <div class="empty-chat"><p class="muted">This screen is built in a later step.</p></div>`;
    $('[data-drawer]', main).addEventListener('click', openDrawer);
    window.lucide?.createIcons({ root: main });
  }
}

// Phone drawer: tap the dark backdrop or press Esc to close.
$('.drawer-backdrop').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && app.classList.contains('drawer-open')) closeDrawer(); });

window.addEventListener('hashchange', render);

(async () => {
  [state.user, state.chats] = await Promise.all([api.getUser(), api.getChats()]);
  await render();
})();
