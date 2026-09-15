/**
 * CutIn.ts — DOM overlays for the big moments: the ultimate-jutsu cut-in (versus portrait sweeps
 * in on a coloured slash with the jutsu name), the awakening banner, and a white screen flash.
 */
import { CharacterDef } from '../core/Types';

let styled = false;
function ensureStyle(): void {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
  .cutin { position:absolute; inset:0; z-index:18; pointer-events:none; overflow:hidden; font-family:'Segoe UI', system-ui, sans-serif; }
  .cutin .band { position:absolute; left:-10%; right:-10%; top:22%; height:56%; transform:skewY(-6deg); background:linear-gradient(90deg, rgba(0,0,0,.92), rgba(30,0,0,.85) 60%, rgba(0,0,0,0)); animation:cutband .3s ease-out both; }
  .cutin.p2 .band { background:linear-gradient(270deg, rgba(0,0,0,.92), rgba(0,0,30,.85) 60%, rgba(0,0,0,0)); }
  .cutin .face { position:absolute; bottom:-4vh; height:96vh; left:4vw; filter:drop-shadow(0 0 30px rgba(255,200,80,.8)); animation:cutface .35s cubic-bezier(.2,.9,.3,1) both; }
  .cutin.p2 .face { left:auto; right:4vw; transform:scaleX(-1); animation-name:cutface2; }
  .cutin .text { position:absolute; top:34%; left:38vw; color:#fff; text-shadow:0 0 24px #ff9a3c, 0 4px 8px #000; animation:cuttext .35s .1s cubic-bezier(.2,.9,.3,1) both; }
  .cutin.p2 .text { left:auto; right:38vw; text-align:right; }
  .cutin .text .who { font-size:3vh; letter-spacing:.35em; opacity:.9; }
  .cutin .text .name { font-size:8vh; font-weight:900; font-style:italic; letter-spacing:.06em; line-height:1; }
  .cutin .text .sub { font-size:2.4vh; letter-spacing:.3em; margin-top:1vh; color:#ffd166; }
  .cutin .flash { position:absolute; inset:0; background:#fff; opacity:0; }
  .cutin.out { animation:cutout .25s ease-in both; }
  @keyframes cutband { from { transform:skewY(-6deg) translateX(-100%); } to { transform:skewY(-6deg) translateX(0); } }
  @keyframes cutface { from { transform:translateX(-60vw); opacity:0; } to { transform:none; opacity:1; } }
  @keyframes cutface2 { from { transform:translateX(60vw) scaleX(-1); opacity:0; } to { transform:scaleX(-1); opacity:1; } }
  @keyframes cuttext { from { transform:translateX(30vw) scale(1.4); opacity:0; } to { transform:none; opacity:1; } }
  @keyframes cutout { to { opacity:0; } }
  .flashfx { position:absolute; inset:0; z-index:17; pointer-events:none; background:#fff; animation:flashfx .45s ease-out both; }
  @keyframes flashfx { from { opacity:.95; } to { opacity:0; } }
  .awakebanner { position:absolute; left:50%; top:30%; transform:translate(-50%,-50%); z-index:18; pointer-events:none; color:#fff; font-family:'Segoe UI', system-ui, sans-serif; font-weight:900; font-size:7vh; letter-spacing:.3em; text-shadow:0 0 30px #ff6a1a, 0 0 60px #ff9a3c, 0 4px 8px #000; animation:awake 1.4s ease-out both; }
  @keyframes awake { 0% { opacity:0; transform:translate(-50%,-50%) scale(2.2); } 20% { opacity:1; transform:translate(-50%,-50%) scale(1); } 80% { opacity:1; } 100% { opacity:0; } }`;
  document.head.appendChild(st);
}

export function showUltimateCutIn(def: CharacterDef, side: 1 | 2, durationMs = 1100): void {
  ensureStyle();
  const el = document.createElement('div');
  el.className = `cutin ${side === 2 ? 'p2' : 'p1'}`;
  el.innerHTML = `
    <div class="band"></div>
    <img class="face" src="${def.vsFace ?? def.stand ?? ''}" alt="">
    <div class="text"><div class="who">${side === 1 ? '1P' : '2P'} · ${def.displayName}</div><div class="name">${def.ultimateName ?? 'ULTIMATE JUTSU'}</div><div class="sub">ULTIMATE JUTSU</div></div>`;
  document.body.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, durationMs);
}

export function screenFlash(): void {
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'flashfx';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 500);
}

export function showAwakenBanner(def: CharacterDef): void {
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'awakebanner';
  el.textContent = `${def.displayName} — AWAKENING`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}
