// OpenRouter credit: users pay OpenRouter directly. This page shows the connection and credit.
// It stands in for the Purchase page until SingleTokens sells tokens itself (Stripe).

import { el, esc, icons, $, fmtInt, modal, toast } from './ui.js';
import * as api from './api.js';

const TOP_UP_URL = 'https://openrouter.ai/settings/credits';
const KEYS_URL = 'https://openrouter.ai/settings/keys';

export async function renderOpenRouter(main, { openDrawer, onUserChanged }) {
  const [user, model] = await Promise.all([api.getUser(), api.getMostUsedModel()]);
  const per = api.typicalMessageCost(model);

  main.innerHTML = `
    <div class="topbar only-phone"><button class="icon-btn" data-drawer aria-label="Open menu"><i data-lucide="menu"></i></button></div>
    <div class="page-scroll"><div class="purchase">
      <h1 class="page-title">OpenRouter credit</h1>
      <p class="page-sub">You pay OpenRouter directly for what you use. SingleTokens never touches your money.</p>
      <div class="purchase-grid"></div>
      <div class="bottom-bar"></div>
    </div></div>`;
  $('[data-drawer]', main).addEventListener('click', openDrawer);
  const grid = $('.purchase-grid', main);

  grid.appendChild(user.openrouterConnected ? creditCard(user) : connectCard());
  grid.appendChild(howCard());

  $('.bottom-bar', main).innerHTML = user.openrouterConnected && user.creditKnown !== false
    ? `With <span class="num-pill">${fmtInt(user.creditTokens)}</span> SingleTokens you can send about <span class="num-pill">${fmtInt(Math.floor(user.creditTokens / per))}</span> messages with <span class="num-pill">${esc(model.name)}</span>.`
    : `<span class="num-pill">100,000</span> SingleTokens = <span class="num-pill">$1</span> of OpenRouter credit. A typical message with <span class="num-pill">${esc(model.name)}</span> costs about <span class="num-pill">${fmtInt(per)}</span>.`;

  icons(main);

  function creditCard(u) {
    const card = el(`<div class="p-card or-card">
      <i data-lucide="coins" class="watermark" style="left:-56px;bottom:-56px"></i>
      <div class="or-status"><span class="status-dot is-on"></span>Connected to OpenRouter</div>
      ${u.creditKnown === false
        ? `<div class="p-amount" aria-label="Unknown">—</div><div class="p-amount-label">OpenRouter didn't share your credit. Check it on their site.</div>`
        : `<div class="p-amount">${fmtInt(u.creditTokens)}</div><div class="p-amount-label">SingleTokens <span class="muted">· ~$${(u.creditTokens / 100000).toFixed(2)} of credit</span></div>`}
      <div class="or-actions">
        <a class="checkout-btn" href="${TOP_UP_URL}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Top up on OpenRouter</a>
        <button class="btn btn-ghost" data-disconnect>Disconnect</button>
      </div></div>`);
    $('[data-disconnect]', card).addEventListener('click', confirmDisconnect);
    return card;
  }

  function connectCard() {
    const card = el(`<div class="p-card or-card">
      <i data-lucide="link" class="watermark" style="left:-56px;bottom:-56px"></i>
      <div class="or-status"><span class="status-dot"></span>Not connected</div>
      <h2 class="or-title">Connect your OpenRouter account</h2>
      <p class="or-text">OpenRouter gives you every model with one account. You approve SingleTokens on their site, then come straight back here.</p>
      <div class="or-actions"><button class="checkout-btn" data-connect><i data-lucide="link"></i>Connect OpenRouter</button></div></div>`);
    const btn = $('[data-connect]', card);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.lastChild.textContent = 'Connecting…';
      await api.connectOpenRouter();  // leaves for openrouter.ai and comes back via connect.html
    });
    return card;
  }

  function confirmDisconnect() {
    modal({
      title: 'Disconnect OpenRouter',
      body: `<p style="margin:0 0 var(--sp-12);color:var(--text)">SingleTokens forgets your OpenRouter key and you can't send messages until you connect again. Your chats and GPTs stay.</p>
             <p style="margin:0;color:var(--text-muted);font-size:var(--fs-13)">To remove the key completely, also delete it on <a href="${KEYS_URL}" target="_blank" rel="noopener">OpenRouter's keys page</a>.</p>`,
      actions: [
        { label: 'Cancel', kind: 'ghost', onClick: c => c() },
        { label: 'Disconnect', kind: 'danger', onClick: async c => {
          try { await api.disconnectOpenRouter(); } catch (err) { return toast(err.message, { error: true }); }
          c();
          toast('OpenRouter disconnected');
          await onUserChanged();
          renderOpenRouter(main, { openDrawer, onUserChanged });
        } },
      ],
    });
  }
}

function howCard() {
  return el(`<div class="p-card or-card">
    <i data-lucide="info" class="watermark" style="right:-56px;bottom:-56px"></i>
    <h2 class="or-title">How paying works</h2>
    <ol class="or-steps">
      <li><span class="step-num">1</span><div><b>You add credit on OpenRouter.</b> You pay them on their website, not SingleTokens.</div></li>
      <li><span class="step-num">2</span><div><b>Every message is billed to your credit</b> at the model's real price, with no markup.</div></li>
      <li><span class="step-num">3</span><div><b>SingleTokens shows the cost</b> under every answer: 100,000 SingleTokens = $1.</div></li>
    </ol></div>`);
}
