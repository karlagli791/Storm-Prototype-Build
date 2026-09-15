/**
 * CharacterSelect.ts — Storm 2 style character select, built from the game's own chara_sel
 * textures (public/assets/ui/sel): sky backdrop, "Character Select" brush title, framed 128 px
 * icon boxes, full-body "stand" hero art on the side of the player who is picking, name plate and
 * jutsu line. Flow (matches the Storm 2 offline flow): 1P leader → 1P support → 2P leader → 2P
 * support → stage → battle. Keyboard (WASD / arrows, J or Enter confirm, K or Backspace back) and
 * gamepad (stick / D-pad, Cross confirm, Circle back) are both live.
 *
 * The screen is a DOM overlay (crisp text, cheap to author); the battle itself is canvas + WebGL.
 */
import { CharacterDef } from '../core/Types';
import { GamepadState, PAD } from '../core/GamepadState';

export interface StageOption { id: string; name: string; }
export interface TeamPick { leader: CharacterDef; support: CharacterDef; }
export interface Selection { p1: TeamPick; p2: TeamPick; stage: StageOption; }

type Step = 'P1_LEAD' | 'P1_SUP' | 'P2_LEAD' | 'P2_SUP' | 'STAGE';
const STEP_ORDER: Step[] = ['P1_LEAD', 'P1_SUP', 'P2_LEAD', 'P2_SUP', 'STAGE'];
const COLS = 5;

const CSS = `
#csel { position:absolute; inset:0; z-index:20; overflow:hidden; font-family:'Segoe UI', system-ui, sans-serif; color:#fff; user-select:none;
  background:#7fb3e6 url(assets/ui/sel/bg.png) center/cover no-repeat; }
#csel .title { position:absolute; left:3.5%; top:3%; height:9vh; }
#csel .stepline { position:absolute; left:3.5%; top:13.5%; font-size:2.1vh; letter-spacing:.25em; text-transform:uppercase; color:#fff; text-shadow:0 2px 6px rgba(0,0,0,.5); }
#csel .hero { position:absolute; bottom:0; height:88vh; width:34vw; pointer-events:none; }
#csel .hero.p1 { left:-1vw; } #csel .hero.p2 { right:-1vw; transform:scaleX(-1); }
#csel .hero img { position:absolute; bottom:0; left:50%; transform:translateX(-50%); height:100%; filter:drop-shadow(0 12px 18px rgba(0,0,0,.35)); transition:opacity .12s; }
#csel .hero.p2 img { transform:translateX(-50%); }
#csel .hero.dim img { opacity:.55; filter:grayscale(.6) drop-shadow(0 12px 18px rgba(0,0,0,.35)); }
#csel .hero .plate { position:absolute; left:50%; bottom:6vh; transform:translateX(-50%); width:30vw; height:7.2vh; background:url(assets/ui/sel/plate_wide.png) center/100% 100% no-repeat; display:flex; flex-direction:column; justify-content:center; padding:0 3vw; box-sizing:border-box; }
#csel .hero.p2 .plate { transform:translateX(-50%) scaleX(-1); }
#csel .hero.p2 .plate > * { transform:scaleX(-1); }
#csel .plate .name { font-size:2.6vh; font-weight:700; letter-spacing:.12em; text-shadow:0 2px 4px rgba(0,0,0,.6); white-space:nowrap; }
#csel .plate .sub { font-size:1.5vh; letter-spacing:.15em; opacity:.85; white-space:nowrap; }
#csel .tag { position:absolute; top:2vh; font-size:2.6vh; font-weight:800; letter-spacing:.1em; padding:.4vh 1.6vh; border-radius:.6vh; text-shadow:0 2px 4px rgba(0,0,0,.6); }
#csel .hero.p1 .tag { left:3vw; background:linear-gradient(90deg,#d2452c,#ff7a3c); }
#csel .hero.p2 .tag { left:3vw; transform:scaleX(-1); background:linear-gradient(90deg,#2c6fd2,#3cb8ff); }
#csel .grid { position:absolute; left:50%; top:22%; transform:translateX(-50%); display:grid; grid-template-columns:repeat(${COLS}, 11.5vh); gap:1.4vh; }
#csel .cell { position:relative; width:11.5vh; height:11.5vh; border-radius:1.4vh; background:rgba(0,20,40,.35); box-shadow:inset 0 0 0 .3vh rgba(255,255,255,.35); overflow:hidden; transition:transform .08s; }
#csel .cell img { width:100%; height:100%; display:block; }
#csel .cell.sel { transform:scale(1.12); box-shadow:0 0 0 .5vh #fff, 0 0 2.4vh .6vh rgba(255,240,180,.9); z-index:2; }
#csel .cell.locked1::after, #csel .cell.locked2::after { content:''; position:absolute; inset:0; border-radius:1.4vh; box-shadow:inset 0 0 0 .55vh #ff6a3c; }
#csel .cell.locked2::after { box-shadow:inset 0 0 0 .55vh #3cb8ff; }
#csel .cell .badge { position:absolute; right:.4vh; top:.4vh; font-size:1.5vh; font-weight:800; padding:.1vh .6vh; border-radius:.4vh; background:#ff6a3c; }
#csel .cell .badge.b2 { background:#3cb8ff; }
#csel .cell .badge.sup { top:auto; bottom:.4vh; font-size:1.2vh; background:rgba(0,0,0,.6); }
#csel .stages { position:absolute; left:50%; top:22%; transform:translateX(-50%); display:flex; gap:2vh; }
#csel .stage { width:26vh; height:15vh; border-radius:1.4vh; background:#123; box-shadow:inset 0 0 0 .3vh rgba(255,255,255,.35); display:flex; align-items:flex-end; justify-content:center; padding:1vh; box-sizing:border-box; font-size:1.7vh; letter-spacing:.15em; text-align:center; text-shadow:0 2px 4px #000; background-size:cover; background-position:center; }
#csel .stage.sel { transform:scale(1.08); box-shadow:0 0 0 .5vh #fff, 0 0 2.4vh .6vh rgba(255,240,180,.9); }
#csel .team { position:absolute; top:64%; display:flex; gap:1.2vh; align-items:center; }
#csel .team.p1 { left:calc(50% - 33vh); } #csel .team.p2 { right:calc(50% - 33vh); flex-direction:row-reverse; }
#csel .team .slot { width:8vh; height:8vh; border-radius:1vh; background:rgba(0,20,40,.45); box-shadow:inset 0 0 0 .3vh rgba(255,255,255,.35); overflow:hidden; position:relative; }
#csel .team .slot img { width:100%; height:100%; }
#csel .team .slot span { position:absolute; left:0; right:0; bottom:0; font-size:1.2vh; text-align:center; background:rgba(0,0,0,.55); letter-spacing:.1em; }
#csel .help { position:absolute; bottom:1.2vh; left:50%; transform:translateX(-50%); font-size:1.6vh; letter-spacing:.12em; opacity:.85; text-shadow:0 1px 3px #000; white-space:nowrap; }
#csel .go { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); font-size:9vh; font-weight:900; letter-spacing:.2em; color:#fff; text-shadow:0 0 30px #ffb347, 0 4px 8px #000; opacity:0; pointer-events:none; }
#csel .go.show { animation:goflash .9s ease-out forwards; }
@keyframes goflash { 0%{opacity:0; transform:translate(-50%,-50%) scale(1.6);} 25%{opacity:1; transform:translate(-50%,-50%) scale(1);} 100%{opacity:1;} }
`;

/**
 * Storm-style VS splash shown while the battle assets load: both leaders' versus art, names and
 * supports, red vs blue brush plates. Returns a function that fades it out.
 */
export function showVsSplash(sel: Selection): () => void {
  const el = document.createElement('div');
  el.id = 'vsplash';
  el.innerHTML = `
    <style>
      #vsplash { position:absolute; inset:0; z-index:19; overflow:hidden; font-family:'Segoe UI', system-ui, sans-serif; color:#fff; user-select:none;
        background:linear-gradient(100deg, #b8321f 0 50%, #1f4fb8 50% 100%); transition:opacity .35s; }
      #vsplash::before { content:''; position:absolute; inset:0; background:url(assets/ui/sel/bg.png) center/cover; opacity:.18; mix-blend-mode:screen; }
      #vsplash .side { position:absolute; top:0; bottom:0; width:50%; }
      #vsplash .side img.face { position:absolute; bottom:0; height:92vh; filter:drop-shadow(0 14px 22px rgba(0,0,0,.45)); animation:slide .45s cubic-bezier(.2,.9,.3,1) both; }
      #vsplash .p1 { left:0; } #vsplash .p1 img.face { left:4vw; }
      #vsplash .p2 { right:0; } #vsplash .p2 img.face { right:4vw; transform:scaleX(-1); animation-name:slide2; }
      #vsplash .name { position:absolute; top:9vh; font-size:4.2vh; font-weight:900; letter-spacing:.14em; text-shadow:0 3px 8px rgba(0,0,0,.7); }
      #vsplash .p1 .name { left:5vw; } #vsplash .p2 .name { right:5vw; text-align:right; }
      #vsplash .sub { display:block; font-size:1.8vh; font-weight:500; letter-spacing:.2em; opacity:.9; }
      #vsplash .sup { position:absolute; bottom:5vh; display:flex; align-items:center; gap:1vh; font-size:1.8vh; letter-spacing:.15em; }
      #vsplash .p1 .sup { left:5vw; } #vsplash .p2 .sup { right:5vw; flex-direction:row-reverse; }
      #vsplash .sup img { width:8vh; height:8vh; border-radius:1vh; box-shadow:0 0 0 .3vh rgba(255,255,255,.6); }
      #vsplash .vs { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%) rotate(-8deg); font-size:16vh; font-weight:900; font-style:italic; letter-spacing:.05em; color:#fff; text-shadow:0 0 30px #000, 0 6px 0 #6b0f0f, 0 0 60px rgba(255,200,80,.8); animation:pop .5s .25s cubic-bezier(.2,1.4,.4,1) both; }
      #vsplash .stage { position:absolute; left:50%; bottom:3vh; transform:translateX(-50%); font-size:2vh; letter-spacing:.3em; text-shadow:0 2px 4px #000; }
      @keyframes slide { from { transform:translateX(-40vw); opacity:0; } to { transform:none; opacity:1; } }
      @keyframes slide2 { from { transform:translateX(40vw) scaleX(-1); opacity:0; } to { transform:scaleX(-1); opacity:1; } }
      @keyframes pop { from { transform:translate(-50%,-50%) rotate(-8deg) scale(3); opacity:0; } to { transform:translate(-50%,-50%) rotate(-8deg) scale(1); opacity:1; } }
    </style>
    <div class="side p1"><img class="face" src="${sel.p1.leader.vsFace ?? sel.p1.leader.stand ?? ''}" alt=""><div class="name">${sel.p1.leader.displayName}<span class="sub">${sel.p1.leader.title ?? ''}</span></div>
      <div class="sup"><img src="${sel.p1.support.icon ?? ''}" alt=""><span>SUPPORT · ${sel.p1.support.displayName}</span></div></div>
    <div class="side p2"><img class="face" src="${sel.p2.leader.vsFace ?? sel.p2.leader.stand ?? ''}" alt=""><div class="name">${sel.p2.leader.displayName}<span class="sub">${sel.p2.leader.title ?? ''}</span></div>
      <div class="sup"><img src="${sel.p2.support.icon ?? ''}" alt=""><span>SUPPORT · ${sel.p2.support.displayName}</span></div></div>
    <div class="vs">VS</div>
    <div class="stage">${sel.stage.name}</div>`;
  document.body.appendChild(el);
  return () => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); };
}

export class CharacterSelect {
  private el!: HTMLDivElement;
  private step: Step = 'P1_LEAD';
  private cursor = 0;
  private stageCursor = 0;
  private picks: Partial<Record<Step, CharacterDef | StageOption>> = {};
  private pad = new GamepadState();
  private stickLatch = false;
  private lastKeyTime = 0;
  private resolve!: (s: Selection) => void;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);
  private raf = 0;

  constructor(private roster: CharacterDef[], private stages: StageOption[]) {}

  run(): Promise<Selection> {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.id = 'csel';
    document.body.appendChild(this.el);
    this.render();
    window.addEventListener('keydown', this.keyHandler);
    const loop = () => { this.pollPad(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
    return new Promise((res) => (this.resolve = res));
  }

  // ------------------------------------------------------------------ input
  private onKey(e: KeyboardEvent): void {
    const map: Record<string, string> = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyJ: 'ok', Enter: 'ok', Space: 'ok', KeyK: 'back', Backspace: 'back', Escape: 'back' };
    const a = map[e.code];
    if (!a) return;
    e.preventDefault();
    this.act(a);
  }

  private pollPad(): void {
    const s = this.pad.poll();
    if (!s.connected) return;
    const now = performance.now();
    const dir = Math.abs(s.lx) > 0.5 ? (s.lx > 0 ? 'right' : 'left') : Math.abs(s.ly) > 0.5 ? (s.ly > 0 ? 'up' : 'down') : null;
    if (dir) {
      if (!this.stickLatch || now - this.lastKeyTime > 220) { this.act(dir); this.lastKeyTime = now; }
      this.stickLatch = true;
    } else this.stickLatch = false;
    if (this.pad.justPressed(PAD.DPAD_UP)) this.act('up');
    if (this.pad.justPressed(PAD.DPAD_DOWN)) this.act('down');
    if (this.pad.justPressed(PAD.DPAD_LEFT)) this.act('left');
    if (this.pad.justPressed(PAD.DPAD_RIGHT)) this.act('right');
    if (this.pad.justPressed(PAD.CROSS) || this.pad.justPressed(PAD.OPTIONS)) this.act('ok');
    if (this.pad.justPressed(PAD.CIRCLE)) this.act('back');
  }

  private act(a: string): void {
    if (this.step === 'STAGE') {
      if (a === 'left') this.stageCursor = (this.stageCursor + this.stages.length - 1) % this.stages.length;
      else if (a === 'right') this.stageCursor = (this.stageCursor + 1) % this.stages.length;
      else if (a === 'ok') { this.picks.STAGE = this.stages[this.stageCursor]; this.finish(); return; }
      else if (a === 'back') this.back();
      this.render();
      return;
    }
    const n = this.roster.length;
    const rows = Math.ceil(n / COLS);
    let r = Math.floor(this.cursor / COLS), c = this.cursor % COLS;
    if (a === 'left') c = (c + COLS - 1) % COLS;
    else if (a === 'right') c = (c + 1) % COLS;
    else if (a === 'up') r = (r + rows - 1) % rows;
    else if (a === 'down') r = (r + 1) % rows;
    else if (a === 'ok') { this.confirm(); return; }
    else if (a === 'back') { this.back(); return; }
    let idx = r * COLS + c;
    if (idx >= n) idx = a === 'down' ? c : n - 1; // wrap onto the shorter last row
    this.cursor = idx;
    this.render();
  }

  private confirm(): void {
    const def = this.roster[this.cursor];
    // A support cannot be the same character as its leader.
    if (this.step === 'P1_SUP' && this.picks.P1_LEAD === def) return this.shake();
    if (this.step === 'P2_SUP' && this.picks.P2_LEAD === def) return this.shake();
    this.picks[this.step] = def;
    const i = STEP_ORDER.indexOf(this.step);
    this.step = STEP_ORDER[i + 1];
    this.render();
  }

  private back(): void {
    const i = STEP_ORDER.indexOf(this.step);
    if (i === 0) return;
    this.step = STEP_ORDER[i - 1];
    const prev = this.picks[this.step] as CharacterDef | undefined;
    if (prev) this.cursor = Math.max(0, this.roster.indexOf(prev));
    delete this.picks[this.step];
    this.render();
  }

  private shake(): void {
    const cell = this.el.querySelector('.cell.sel') as HTMLElement | null;
    if (!cell) return;
    cell.animate([{ transform: 'scale(1.12) translateX(0)' }, { transform: 'scale(1.12) translateX(-6px)' }, { transform: 'scale(1.12) translateX(6px)' }, { transform: 'scale(1.12) translateX(0)' }], { duration: 180 });
  }

  private finish(): void {
    const sel: Selection = {
      p1: { leader: this.picks.P1_LEAD as CharacterDef, support: this.picks.P1_SUP as CharacterDef },
      p2: { leader: this.picks.P2_LEAD as CharacterDef, support: this.picks.P2_SUP as CharacterDef },
      stage: this.picks.STAGE as StageOption,
    };
    const go = this.el.querySelector('.go') as HTMLElement;
    go.textContent = 'FIGHT';
    go.classList.add('show');
    window.removeEventListener('keydown', this.keyHandler);
    cancelAnimationFrame(this.raf);
    setTimeout(() => { this.el.remove(); this.resolve(sel); }, 700);
  }

  // ------------------------------------------------------------------ view
  private render(): void {
    const stepText: Record<Step, string> = { P1_LEAD: '1P — choose your leader', P1_SUP: '1P — choose your support', P2_LEAD: '2P (COM) — choose the leader', P2_SUP: '2P (COM) — choose the support', STAGE: 'choose the stage' };
    const focusDef = this.step === 'STAGE' ? null : this.roster[this.cursor];
    const p1Hero = (this.step === 'P1_LEAD' || this.step === 'P1_SUP') ? focusDef : (this.picks.P1_LEAD as CharacterDef | undefined) ?? null;
    const p2Hero = (this.step === 'P2_LEAD' || this.step === 'P2_SUP') ? focusDef : (this.picks.P2_LEAD as CharacterDef | undefined) ?? null;
    const hero = (side: 'p1' | 'p2', d: CharacterDef | null, active: boolean) => d ? `
      <div class="hero ${side} ${active ? '' : 'dim'}">
        <img src="${d.stand ?? d.vsFace ?? ''}" alt="">
        <div class="tag">${side === 'p1' ? '1P' : '2P'}</div>
        <div class="plate"><div class="name">${d.displayName}</div><div class="sub">${d.title ?? ''}${d.jutsuName ? ' · ' + d.jutsuName : ''}</div></div>
      </div>` : '';
    const lock = (d: CharacterDef) => {
      const tags: string[] = [];
      if (this.picks.P1_LEAD === d) tags.push('<span class="badge">1P</span>');
      if (this.picks.P2_LEAD === d) tags.push('<span class="badge b2">2P</span>');
      if (this.picks.P1_SUP === d) tags.push('<span class="badge sup">1P SUPPORT</span>');
      if (this.picks.P2_SUP === d) tags.push('<span class="badge sup">2P SUPPORT</span>');
      return tags.join('');
    };
    const cells = this.roster.map((d, i) => `<div class="cell ${i === this.cursor && this.step !== 'STAGE' ? 'sel' : ''} ${this.picks.P1_LEAD === d ? 'locked1' : ''} ${this.picks.P2_LEAD === d ? 'locked2' : ''}"><img src="${d.icon ?? ''}" alt="${d.displayName}">${lock(d)}</div>`).join('');
    const stages = this.stages.map((s, i) => `<div class="stage ${i === this.stageCursor ? 'sel' : ''}" style="background-image:url(assets/ui/sel/stage_${s.id}.jpg)">${s.name}</div>`).join('');
    const slot = (d: CharacterDef | undefined, label: string) => `<div class="slot">${d ? `<img src="${d.icon}" alt="">` : ''}<span>${label}</span></div>`;
    this.el.innerHTML = `
      <img class="title" src="assets/ui/sel/title.png" alt="Character Select">
      <div class="stepline">${stepText[this.step]}</div>
      ${hero('p1', p1Hero, this.step === 'P1_LEAD' || this.step === 'P1_SUP')}
      ${hero('p2', p2Hero, this.step === 'P2_LEAD' || this.step === 'P2_SUP')}
      ${this.step === 'STAGE' ? `<div class="stages">${stages}</div>` : `<div class="grid">${cells}</div>`}
      <div class="team p1">${slot(this.picks.P1_LEAD as CharacterDef, 'LEADER')}${slot(this.picks.P1_SUP as CharacterDef, 'SUPPORT')}</div>
      <div class="team p2">${slot(this.picks.P2_LEAD as CharacterDef, 'LEADER')}${slot(this.picks.P2_SUP as CharacterDef, 'SUPPORT')}</div>
      <div class="help">STICK / WASD move · CROSS / J confirm · CIRCLE / K back · ${this.step === 'STAGE' ? 'pick a stage to fight' : 'supports call in with L1 / R1 / Y during the battle'}</div>
      <div class="go"></div>`;
  }
}
