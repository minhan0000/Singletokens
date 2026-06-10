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
  {name:'Claude Sonnet 4.5',provider:'Anthropic',mult:1,tag:'Empfohlen',tagClass:'tag-blue',cls:'reference'},
  {name:'Claude Opus 4.5',provider:'Anthropic',mult:5,tag:'Leistungsstark',tagClass:'tag-blue',cls:'expensive'},
  {name:'Claude Haiku 4.5',provider:'Anthropic',mult:0.27,tag:'Ultraschnell',tagClass:'tag-cyan',cls:'cheap'},
  {name:'Claude 3.7 Sonnet',provider:'Anthropic',mult:2,tag:'Thinking',tagClass:'tag-blue',cls:'',isNew:true},
  {name:'GPT-4o',provider:'OpenAI',mult:0.85,tag:'Vielseitig',tagClass:'tag-green',cls:''},
  {name:'GPT-5',provider:'OpenAI',mult:70,tag:'Neuestes',tagClass:'tag-red',cls:'expensive'},
  {name:'OpenAI o1',provider:'OpenAI',mult:20,tag:'Reasoning',tagClass:'tag-red',cls:'expensive'},
  {name:'OpenAI o1 Mini',provider:'OpenAI',mult:4,tag:'Reasoning',tagClass:'tag-muted',cls:''},
  {name:'Gemini 2.5 Pro',provider:'Google',mult:4,tag:'Thinking',tagClass:'tag-blue',cls:'',isNew:true},
  {name:'Gemini Pro 2.0',provider:'Google',mult:2.33,tag:'Multimodal',tagClass:'tag-blue',cls:''},
  {name:'Gemini Flash 2.0',provider:'Google',mult:0.50,tag:'Günstig',tagClass:'tag-cyan',cls:'cheap'},
  {name:'Llama 3.3 70B',provider:'Meta',mult:0.3,tag:'Open Source',tagClass:'tag-cyan',cls:'cheap'},
  {name:'Llama 11B',provider:'Meta',mult:0.13,tag:'Kleinst',tagClass:'tag-cyan',cls:'cheap'},
  {name:'Llama 3.2 Vision 11B',provider:'Meta',mult:0.3,tag:'Multimodal',tagClass:'tag-green',cls:'cheap',isNew:true},
  {name:'Mistral Large 2',provider:'Mistral',mult:2.67,tag:'Europäisch',tagClass:'tag-muted',cls:''},
  {name:'Mistral Small',provider:'Mistral',mult:0.67,tag:'Effizient',tagClass:'tag-green',cls:'cheap'},
  {name:'DeepSeek V3',provider:'DeepSeek',mult:0.9,tag:'Open Source',tagClass:'tag-green',cls:''},
  {name:'Qwen 2.5 72B',provider:'Alibaba',mult:0.3,tag:'Open Source',tagClass:'tag-cyan',cls:'cheap'},
  {name:'Grok 2',provider:'xAI',mult:1.67,tag:'Von xAI',tagClass:'tag-muted',cls:''},
  {name:'Perplexity Sonar Pro',provider:'Perplexity',mult:2.5,tag:'Web-Suche',tagClass:'tag-green',cls:'',isNew:true},
  {name:'Command R+',provider:'Cohere',mult:0.8,tag:'RAG',tagClass:'tag-green',cls:'cheap',isNew:true},
  {name:'Phi-4 Mini',provider:'Microsoft',mult:0.2,tag:'Kompakt',tagClass:'tag-cyan',cls:'cheap',isNew:true},
  {name:'Amazon Nova Lite',provider:'Amazon',mult:0.15,tag:'Günstig',tagClass:'tag-cyan',cls:'cheap',isNew:true},
  {name:'Gemma 2 27B',provider:'Google',mult:0.35,tag:'Open Source',tagClass:'tag-cyan',cls:'cheap'},
];

const IMG_MODELS = [
  {name:'Flux 1.1 Pro',provider:'Black Forest Labs',mult:3,tag:'Scharf',tagClass:'tag-pink',cls:'img-card',isNew:true},
  {name:'DALL·E 3',provider:'OpenAI',mult:6,tag:'Kreativ',tagClass:'tag-pink',cls:'img-card',isNew:true},
  {name:'Stable Diffusion 3.5',provider:'Stability AI',mult:2,tag:'Open Source',tagClass:'tag-pink',cls:'img-card',isNew:true},
  {name:'Ideogram 2.0',provider:'Ideogram',mult:4,tag:'Text in Bild',tagClass:'tag-pink',cls:'img-card',isNew:true},
];

const VOICE_MODELS = [
  {name:'Multilingual v2',provider:'ElevenLabs',mult:2.5,tag:'Natürlich',tagClass:'tag-purple',cls:'voice-card',isNew:true},
  {name:'Whisper Large v3',provider:'OpenAI',mult:0.5,tag:'Transkription',tagClass:'tag-purple',cls:'voice-card',isNew:true},
];

function getMultClass(m) {
  if(m.cls) return m.cls;
  if(m.mult>=10) return'expensive';
  if(m.mult<=0.5) return'cheap';
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
      <span class="mc-tag ${m.tagClass}">${escHtml(m.tag)}</span>
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
  sl.style.background = `linear-gradient(to right, #22D3EE ${pct}%, var(--dark4) ${pct}%)`;
}

// ─── PROVIDER MARQUEE ───
const PROVIDERS = [
  {name:'Anthropic',color:'#93C5FD'},{name:'OpenAI',color:'#86EFAC'},
  {name:'Google',color:'#FCD34D'},{name:'Meta',color:'#22D3EE'},
  {name:'Mistral',color:'#A78BFA'},{name:'DeepSeek',color:'#6EE7B7'},
  {name:'xAI',color:'#F0F6FC'},{name:'Alibaba',color:'#FCA5A5'},
  {name:'Black Forest Labs',color:'#F9A8D4'},{name:'Stability AI',color:'#F9A8D4'},
  {name:'Ideogram',color:'#C4B5FD'},{name:'ElevenLabs',color:'#C4B5FD'},
  {name:'Perplexity',color:'#86EFAC'},{name:'Cohere',color:'#93C5FD'},
  {name:'Microsoft',color:'#93C5FD'},{name:'Amazon',color:'#FCD34D'},
];

// ─── SHADER BACKGROUND ───
function initShader() {
  const canvas = document.getElementById('shader-bg');
  const gl = canvas.getContext('webgl', {alpha: true, premultipliedAlpha: false});
  if(!gl) return;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const vs = `attribute vec4 p;void main(){gl_Position=p;}`;
  const fs = `
    precision highp float;
    uniform vec2 iResolution;
    uniform float iTime;
    const float overallSpeed=0.06,gridSmoothWidth=0.015,axisWidth=0.05,majorLineWidth=0.025,minorLineWidth=0.0125,majorLineFrequency=5.0,minorLineFrequency=1.0,scale=5.0,minLineWidth=0.01,maxLineWidth=0.25,lineSpeed=1.0*overallSpeed,lineAmplitude=1.0,lineFrequency=0.2,warpSpeed=0.2*overallSpeed,warpFrequency=0.5,warpAmplitude=1.0,offsetFrequency=0.5,offsetSpeed=1.33*overallSpeed,minOffsetSpread=0.6,maxOffsetSpread=2.0;
    const int linesPerGroup=16;
    const vec4 lineColor=vec4(0.3,1.0,1.0,1.0);
    #define drawCircle(pos,radius,coord) smoothstep(radius+gridSmoothWidth,radius,length(coord-(pos)))
    #define drawSmoothLine(pos,halfWidth,t) smoothstep(halfWidth,0.0,abs(pos-(t)))
    #define drawCrispLine(pos,halfWidth,t) smoothstep(halfWidth+gridSmoothWidth,halfWidth,abs(pos-(t)))
    float random(float t){return(cos(t)+cos(t*1.3+1.3)+cos(t*1.4+1.4))/3.0;}
    float getPlasmaY(float x,float hf,float off){return random(x*lineFrequency+iTime*lineSpeed)*hf*lineAmplitude+off;}
    void main(){
      vec2 uv=gl_FragCoord.xy/iResolution.xy;
      vec2 space=(gl_FragCoord.xy-iResolution.xy/2.0)/iResolution.x*2.0*scale;
      float hf=1.0-(cos(uv.x*6.28)*0.5+0.5);
      float vf=1.0-(cos(uv.y*6.28)*0.5+0.5);
      space.y+=random(space.x*warpFrequency+iTime*warpSpeed)*warpAmplitude*(0.5+hf);
      space.x+=random(space.y*warpFrequency+iTime*warpSpeed+2.0)*warpAmplitude*hf;
      vec4 lines=vec4(0.0);
      for(int l=0;l<linesPerGroup;l++){
        float ni=float(l)/float(linesPerGroup);
        float ot=iTime*offsetSpeed;
        float op=float(l)+space.x*offsetFrequency;
        float rand=random(op+ot)*0.5+0.5;
        float hw=mix(minLineWidth,maxLineWidth,rand*hf)/2.0;
        float off=random(op+ot*(1.0+ni))*mix(minOffsetSpread,maxOffsetSpread,hf);
        float lp=getPlasmaY(space.x,hf,off);
        float line=drawSmoothLine(lp,hw,space.y)/2.0+drawCrispLine(lp,hw*0.15,space.y);
        float cx=mod(float(l)+iTime*lineSpeed,25.0)-12.0;
        vec2 cp=vec2(cx,getPlasmaY(cx,hf,off));
        line+=drawCircle(cp,0.01,space)*4.0;
        lines+=line*lineColor*rand;
      }
      vec4 col=vec4(0.0);
      col+=lines;
      col.a=col.r*0.8+col.g*0.5+col.b*0.3;
      col.a*=vf;
      gl_FragColor=col;
    }
  `;

  function makeShader(type,src){
    const s=gl.createShader(type);
    gl.shaderSource(s,src);gl.compileShader(s);
    return gl.getShaderParameter(s,gl.COMPILE_STATUS)?s:null;
  }
  const prog=gl.createProgram();
  gl.attachShader(prog,makeShader(gl.VERTEX_SHADER,vs));
  gl.attachShader(prog,makeShader(gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(prog);

  const buf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);

  const posLoc=gl.getAttribLocation(prog,'p');
  const resLoc=gl.getUniformLocation(prog,'iResolution');
  const timeLoc=gl.getUniformLocation(prog,'iTime');

  function resize(){
    canvas.width=window.innerWidth;
    canvas.height=window.innerHeight;
    gl.viewport(0,0,canvas.width,canvas.height);
  }
  window.addEventListener('resize',resize);
  resize();

  const t0=Date.now();
  function render(){
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.vertexAttribPointer(posLoc,2,gl.FLOAT,false,0,0);
    gl.enableVertexAttribArray(posLoc);
    gl.uniform2f(resLoc,canvas.width,canvas.height);
    gl.uniform1f(timeLoc,(Date.now()-t0)/1000);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

// ─── INIT ───
document.addEventListener('DOMContentLoaded', function() {
  renderModels(TEXT_MODELS, 'models-text');
  renderModels(IMG_MODELS,  'models-img');
  renderModels(VOICE_MODELS,'models-voice');

  document.getElementById('tc-text').textContent  = TEXT_MODELS.length;
  document.getElementById('tc-img').textContent   = IMG_MODELS.length;
  document.getElementById('tc-voice').textContent = VOICE_MODELS.length;

  const track = document.getElementById('marquee');
  const chips = [...PROVIDERS, ...PROVIDERS].map(p =>
    `<div class="provider-chip"><span class="provider-dot" style="background:${p.color}"></span>${p.name}</div>`
  ).join('');
  track.innerHTML = chips;

  const calcSlider = document.getElementById('calc-slider');
  calcSlider.addEventListener('input', function() { updateCalc(this.value); });
  updateCalc(calcSlider.value);
  initShader();

  // scroll reveal
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, {threshold:.08, rootMargin:'0px 0px -40px 0px'});
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  // nav scroll
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('main-nav');
    nav.style.background = window.scrollY > 20 ? 'rgba(7,8,10,0.95)' : 'rgba(7,8,10,0.7)';
  });
});
