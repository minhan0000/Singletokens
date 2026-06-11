// ─── AUTH ───
async function goToApp() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    if (!r.ok) { window.location.href = '/login.html'; return; }
  } catch { window.location.href = '/login.html'; return; }
  if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth <= 768) {
    window.location.href = '/app-mobile.html';
  } else {
    window.location.href = '/app.html';
  }
}

// ─── MODELS DATA ───
const TEXT_MODELS = [
  {name:'Claude Sonnet 4.5',provider:'Anthropic',mult:1,tag:'Empfohlen',cls:'reference'},
  {name:'Claude Opus 4.5',provider:'Anthropic',mult:5,tag:'Leistungsstark',cls:'expensive'},
  {name:'Claude Haiku 4.5',provider:'Anthropic',mult:0.27,tag:'Ultraschnell',cls:'cheap'},
  {name:'Claude 3.7 Sonnet',provider:'Anthropic',mult:2,tag:'Thinking',cls:'',isNew:true},
  {name:'GPT-4o',provider:'OpenAI',mult:0.85,tag:'Vielseitig',cls:''},
  {name:'GPT-5',provider:'OpenAI',mult:2,tag:'Neuestes',cls:'expensive'},
  {name:'OpenAI o1',provider:'OpenAI',mult:5,tag:'Reasoning',cls:'expensive'},
  {name:'OpenAI o1 Mini',provider:'OpenAI',mult:0.5,tag:'Reasoning',cls:''},
  {name:'Gemini 2.5 Pro',provider:'Google',mult:0.5,tag:'Thinking',cls:'',isNew:true},
  {name:'Gemini Pro 2.0',provider:'Google',mult:0.3,tag:'Multimodal',cls:''},
  {name:'Gemini Flash 2.0',provider:'Google',mult:0.08,tag:'Günstig',cls:'cheap'},
  {name:'Llama 3.3 70B',provider:'Meta',mult:0.3,tag:'Open Source',cls:'cheap'},
  {name:'Llama 11B',provider:'Meta',mult:0.13,tag:'Kleinst',cls:'cheap'},
  {name:'Llama 3.2 Vision 11B',provider:'Meta',mult:0.3,tag:'Multimodal',cls:'cheap',isNew:true},
  {name:'Mistral Large 2',provider:'Mistral',mult:0.7,tag:'Europäisch',cls:''},
  {name:'Mistral Small',provider:'Mistral',mult:0.12,tag:'Effizient',cls:'cheap'},
  {name:'DeepSeek V3',provider:'DeepSeek',mult:0.15,tag:'Open Source',cls:'cheap'},
  {name:'Qwen 2.5 72B',provider:'Alibaba',mult:0.15,tag:'Open Source',cls:'cheap'},
  {name:'Grok 2',provider:'xAI',mult:0.5,tag:'Von xAI',cls:''},
  {name:'Perplexity Sonar Pro',provider:'Perplexity',mult:1.5,tag:'Web-Suche',cls:'',isNew:true},
  {name:'Command R+',provider:'Cohere',mult:0.3,tag:'RAG',cls:'cheap',isNew:true},
  {name:'Phi-4 Mini',provider:'Microsoft',mult:0.05,tag:'Kompakt',cls:'cheap',isNew:true},
  {name:'Amazon Nova Lite',provider:'Amazon',mult:0.05,tag:'Günstig',cls:'cheap',isNew:true},
  {name:'Gemma 2 27B',provider:'Google',mult:0.1,tag:'Open Source',cls:'cheap'},
];

const IMG_MODELS = [
  {name:'Flux 1.1 Pro',provider:'Black Forest Labs',mult:3,tag:'Scharf',cls:'expensive',isNew:true},
  {name:'DALL·E 3',provider:'OpenAI',mult:6,tag:'Kreativ',cls:'expensive',isNew:true},
  {name:'Stable Diffusion 3.5',provider:'Stability AI',mult:2,tag:'Open Source',cls:'expensive',isNew:true},
  {name:'Ideogram 2.0',provider:'Ideogram',mult:4,tag:'Text in Bild',cls:'expensive',isNew:true},
];

const VOICE_MODELS = [
  {name:'Multilingual v2',provider:'ElevenLabs',mult:2.5,tag:'Natürlich',cls:'expensive',isNew:true},
  {name:'Whisper Large v3',provider:'OpenAI',mult:0.5,tag:'Transkription',cls:'',isNew:true},
];

function getMultClass(m) {
  if(m.cls) return m.cls;
  if(m.mult>=2) return'expensive';
  if(m.mult<=0.3) return'cheap';
  if(m.mult===1) return'reference';
  return'';
}

function escHtml(s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

function renderModels(arr, containerId) {
  const g = document.getElementById(containerId);
  g.innerHTML = arr.map(m => `
    <div class="mc ${getMultClass(m)}">
      ${m.isNew ? '<div class="mc-new">NEU</div>' : ''}
      <div class="mc-provider">${escHtml(m.provider)}</div>
      <div class="mc-name">${escHtml(m.name)}</div>
      <div class="mc-mult">x${m.mult}</div>
      <div class="mc-price">€${(m.mult).toFixed(2)} / 1K</div>
      <span class="mc-tag">${escHtml(m.tag)}</span>
    </div>
  `).join('');
}

// ─── TAB SWITCHING ───
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.model-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
}

// ─── CALCULATOR ───
function updateCalc(val) {
  val = Number(val);
  document.getElementById('calc-val').textContent = val;
  const budget = val; // euros
  // rounding to nearest sensible step
  const r = v => {
    if (v >= 10000) return Math.round(v / 1000) * 1000;
    if (v >= 1000)  return Math.round(v / 100) * 100;
    return Math.round(v / 10) * 10;
  };
  // costs per unit derived from real API pricing
  // Sonnet: $0.003 input + $0.015 output per 1K tokens, avg 1K tokens/msg → ~€0.0083/msg
  // Llama 11B: $0.18/MTok, avg 1K tokens/msg → ~€0.00017/msg
  // Flux 1.1 Pro: $0.04/image → ~€0.037/image
  // ElevenLabs: $0.30/1K chars, avg 750 chars/min → ~€0.21/min
  document.getElementById('cr-sonnet').textContent = '~' + r(budget / 0.0083).toLocaleString('de');
  document.getElementById('cr-llama').textContent  = '~' + r(budget / 0.00017).toLocaleString('de');
  document.getElementById('cr-img').textContent    = '~' + r(budget / 0.037).toLocaleString('de');
  document.getElementById('cr-voice').textContent  = '~' + r(budget / 0.21).toLocaleString('de');
  const sl = document.getElementById('calc-slider');
  const pct = ((val - sl.min) / (sl.max - sl.min)) * 100;
  sl.style.background = `linear-gradient(to right, #141413 ${pct}%, #DEDDD4 ${pct}%)`;
}

// ─── PROVIDER TICKER ───
const PROVIDERS = [
  'Anthropic','OpenAI','Google','Meta','Mistral','DeepSeek','xAI','Alibaba',
  'Black Forest Labs','Stability AI','Ideogram','ElevenLabs','Perplexity',
  'Cohere','Microsoft','Amazon',
];

// ─── INIT ───
document.addEventListener('DOMContentLoaded', function() {
  renderModels(TEXT_MODELS, 'models-text');
  renderModels(IMG_MODELS,  'models-img');
  renderModels(VOICE_MODELS,'models-voice');

  document.getElementById('tc-text').textContent  = TEXT_MODELS.length;
  document.getElementById('tc-img').textContent   = IMG_MODELS.length;
  document.getElementById('tc-voice').textContent = VOICE_MODELS.length;

  const track = document.getElementById('marquee');
  track.innerHTML = [...PROVIDERS, ...PROVIDERS]
    .map(p => `<span class="ticker-item">${escHtml(p)}</span>`)
    .join('');

  const calcSlider = document.getElementById('calc-slider');
  calcSlider.addEventListener('input', function() { updateCalc(this.value); });
  updateCalc(calcSlider.value);

  // scroll reveal
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, {threshold:.08, rootMargin:'0px 0px -40px 0px'});
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  // nav scroll
  window.addEventListener('scroll', () => {
    document.getElementById('main-nav').classList.toggle('scrolled', window.scrollY > 20);
  });
});
