/**
 * CharacterSelect.ts — Storm-style team select built from the game's own chara_sel textures
 * (public/assets/ui/sel): sky backdrop, brush title, framed icon grid, full-body "stand" art on
 * the side of the player who is picking, name plate and jutsu line.
 *
 * Flow: for each side — leader → support 1 → assist type → support 2 → assist type — then the
 * stage. In VS PLAYER mode the second side is picked by the second pad (or the arrow/numpad
 * cluster); every device can drive every step so a single controller still works. The "?" cell
 * picks at random. Both sides may pick the same characters (mirror matches are allowed); a team
 * cannot repeat a character within itself.
 */
import { CharacterDef, SupportType } from '../core/Types';
import { MenuInputPoller, injectMenuCss, menuAudio, el } from './MenuKit';
import { Selection, TeamPick, StageOption, GameMode } from '../core/Selection';
import { SETTINGS } from '../core/Settings';
export type { Selection, TeamPick, StageOption } from '../core/Selection';

type Step = 'P1_LEAD' | 'P1_SUP1' | 'P1_TYPE1' | 'P1_SUP2' | 'P1_TYPE2' | 'P2_LEAD' | 'P2_SUP1' | 'P2_TYPE1' | 'P2_SUP2' | 'P2_TYPE2' | 'STAGE';
const STEP_ORDER: Step[] = ['P1_LEAD', 'P1_SUP1', 'P1_TYPE1', 'P1_SUP2', 'P1_TYPE2', 'P2_LEAD', 'P2_SUP1', 'P2_TYPE1', 'P2_SUP2', 'P2_TYPE2', 'STAGE'];
const TYPES: SupportType[] = ['ATTACK', 'GUARD', 'BALANCE'];
const TYPE_TEXT: Record<SupportType, [string, string]> = {
  ATTACK: ['ATTACK', 'Strike Back when the enemy is launched · Combo Join on call'],
  GUARD: ['GUARD', 'Dash Cut against chakra dashes · Charge Guard when your guard breaks'],
  BALANCE: ['BALANCE', 'Cover Fire on approaching enemies · steady gauge recovery'],
};

const CSS = `
#csel { position:absolute; inset:0; z-index:20; overflow:hidden; font-family:'Segoe UI', system-ui, sans-serif; color:#fff; user-select:none;
  background:#7fb3e6 url(assets/ui/sel/bg.png) center/cover no-repeat; }
#csel .title { position:absolute; left:3.5%; top:3%; height:9vh; }
#csel .stepline { position:absolute; left:3.5%; top:13.5%; font-size:2.1vh; letter-spacing:.25em; text-transform:uppercase; color:#fff; text-shadow:0 2px 6px rgba(0,0,0,.5); }
#csel .stepline b { color:#ffd166; }
#csel .mode { position:absolute; right:3.5%; top:3.5%; font-size:2vh; letter-spacing:.3em; padding:.6vh 1.6vh; background:rgba(0,0,0,.45); border-radius:.6vh; }
#csel .hero { position:absolute; bottom:0; height:88vh; width:30vw; pointer-events:none; transition:opacity .15s; }
#csel .hero.p1 { left:-1vw; } #csel .hero.p2 { right:-1vw; transform:scaleX(-1); }
#csel .hero img { position:absolute; bottom:0; left:50%; transform:translateX(-50%); height:100%; filter:drop-shadow(0 12px 18px rgba(0,0,0,.35)); animation: heroIn .18s ease-out; }
@keyframes heroIn { from { opacity:0; transform:translateX(-50%) translateY(2vh); } to { opacity:1; transform:translateX(-50%); } }
#csel .hero.dim img { opacity:.55; filter:grayscale(.6) drop-shadow(0 12px 18px rgba(0,0,0,.35)); }
#csel .hero .plate { position:absolute; left:50%; bottom:6vh; transform:translateX(-50%); width:28vw; height:7.2vh; background:url(assets/ui/sel/plate_wide.png) center/100% 100% no-repeat; display:flex; flex-direction:column; justify-content:center; padding:0 3vw; box-sizing:border-box; }
#csel .hero.p2 .plate { transform:translateX(-50%) scaleX(-1); }
#csel .hero.p2 .plate > * { transform:scaleX(-1); }
#csel .plate .name { font-size:2.5vh; font-weight:700; letter-spacing:.12em; text-shadow:0 2px 4px rgba(0,0,0,.6); white-space:nowrap; }
#csel .plate .sub { font-size:1.4vh; letter-spacing:.15em; opacity:.85; white-space:nowrap; }
#csel .tag { position:absolute; top:2vh; font-size:2.6vh; font-weight:800; letter-spacing:.1em; padding:.4vh 1.6vh; border-radius:.6vh; text-shadow:0 2px 4px rgba(0,0,0,.6); }
#csel .hero.p1 .tag { left:3vw; background:linear-gradient(90deg,#d2452c,#ff7a3c); }
#csel .hero.p2 .tag { left:3vw; transform:scaleX(-1); background:linear-gradient(90deg,#2c6fd2,#3cb8ff); }
#csel .grid { position:absolute; left:50%; top:20%; transform:translateX(-50%); display:grid; grid-template-columns:repeat(var(--cols), 9.6vh); gap:1vh; }
#csel .cell { position:relative; width:9.6vh; height:9.6vh; border-radius:1.2vh; background:rgba(0,20,40,.35); box-shadow:inset 0 0 0 .3vh rgba(255,255,255,.35); overflow:hidden; transition:transform .08s; }
#csel .cell img { width:100%; height:100%; display:block; }
#csel .cell.rand { display:flex; align-items:center; justify-content:center; font-size:5vh; font-weight:900; color:#ffd166; background:rgba(40,10,0,.55); }
#csel .cell.sel1, #csel .cell.sel2 { transform:scale(1.14); z-index:2; }
#csel .cell.sel1 { box-shadow:0 0 0 .5vh #fff, 0 0 2.4vh .6vh rgba(255,120,60,.9); }
#csel .cell.sel2 { box-shadow:0 0 0 .5vh #fff, 0 0 2.4vh .6vh rgba(60,184,255,.9); }
#csel .cell .badge { position:absolute; right:.3vh; top:.3vh; font-size:1.3vh; font-weight:800; padding:.1vh .5vh; border-radius:.4vh; background:#ff6a3c; }
#csel .cell .badge.b2 { background:#3cb8ff; }
#csel .cell .badge.sup { top:auto; bottom:.3vh; font-size:1.05vh; background:rgba(0,0,0,.6); }
#csel .cell .badge.sup.b2 { right:auto; left:.3vh; }
#csel .stages { position:absolute; left:50%; top:20%; transform:translateX(-50%); display:grid; grid-template-columns:repeat(5, 17vh); gap:1.4vh; }
#csel .stage { width:17vh; height:10.5vh; border-radius:1.2vh; background:#123; box-shadow:inset 0 0 0 .3vh rgba(255,255,255,.35); display:flex; align-items:flex-end; justify-content:center; padding:.8vh; box-sizing:border-box; font-size:1.3vh; letter-spacing:.12em; text-align:center; text-shadow:0 2px 4px #000; background-size:cover; background-position:center; transition:transform .08s; }
#csel .stage.sel { transform:scale(1.08); box-shadow:0 0 0 .5vh #fff, 0 0 2.4vh .6vh rgba(255,240,180,.9); z-index:2; }
#csel .team { position:absolute; top:70%; display:flex; gap:1vh; align-items:flex-end; }
#csel .team.p1 { left:calc(50% - 40vh); } #csel .team.p2 { right:calc(50% - 40vh); flex-direction:row-reverse; }
#csel .team .slot { width:7.6vh; height:7.6vh; border-radius:1vh; background:rgba(0,20,40,.45); box-shadow:inset 0 0 0 .3vh rgba(255,255,255,.35); overflow:hidden; position:relative; }
#csel .team .slot.lead { width:9.6vh; height:9.6vh; }
#csel .team .slot img { width:100%; height:100%; }
#csel .team .slot span { position:absolute; left:0; right:0; bottom:0; font-size:1.05vh; text-align:center; background:rgba(0,0,0,.6); letter-spacing:.08em; }
#csel .team .slot .t { position:absolute; left:0; right:0; top:0; font-size:1.05vh; text-align:center; background:rgba(255,120,60,.85); letter-spacing:.08em; font-weight:800; }
#csel .team.p2 .slot .t { background:rgba(60,184,255,.85); }
#csel .help { position:absolute; bottom:1.2vh; left:50%; transform:translateX(-50%); font-size:1.5vh; letter-spacing:.12em; opacity:.85; text-shadow:0 1px 3px #000; white-space:nowrap; }
#csel .go { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); font-size:9vh; font-weight:900; letter-spacing:.2em; color:#fff; text-shadow:0 0 30px #ffb347, 0 4px 8px #000; opacity:0; pointer-events:none; }
#csel .go.show { animation: goPop .6s ease-out forwards; }
@keyframes goPop { 0% { opacity:0; transform:translate(-50%,-50%) scale(2.2) } 40% { opacity:1; transform:translate(-50%,-50%) scale(1) } 100% { opacity:1 } }
#csel .types { position:absolute; left:50%; top:24%; transform:translateX(-50%); display:flex; gap:2vh; }
#csel .type { width:22vh; padding:2vh 1.6vh; border-radius:1.2vh; background:linear-gradient(180deg, rgba(12,16,30,.92), rgba(6,8,16,.95)); box-shadow:inset 0 0 0 .3vh rgba(255,255,255,.3); text-align:center; transition:transform .1s; }
#csel .type.sel { transform:scale(1.08); box-shadow:0 0 0 .5vh #fff, 0 0 2.4vh .6vh rgba(255,240,180,.9); }
#csel .type h3 { margin:0 0 1vh; font-size:2.6vh; letter-spacing:.3em; color:#ffd166; }
#csel .type p { margin:0; font-size:1.4vh; line-height:1.5; opacity:.85; }
#csel .type .ico { font-size:5vh; margin-bottom:1vh; }
`;

interface Picks { P1_LEAD?: CharacterDef; P1_SUP1?: CharacterDef; P1_SUP2?: CharacterDef; P2_LEAD?: CharacterDef; P2_SUP1?: CharacterDef; P2_SUP2?: CharacterDef; P1_TYPE1?: SupportType; P1_TYPE2?: SupportType; P2_TYPE1?: SupportType; P2_TYPE2?: SupportType; STAGE?: StageOption; }

export class CharacterSelect {
  private el!: HTMLElement;
  private step: Step = 'P1_LEAD';
  private cursor = 0;
  private typeCursor = 0;
  private stageCursor = 0;
  private picks: Picks = {};
  private cols = 8;
  private resolve!: (s: Selection) => void;
  private poller: MenuInputPoller;
  private stopListen: (() => void) | null = null;

  constructor(private roster: CharacterDef[], private stages: StageOption[], private mode: GameMode = 'cpu') {
    this.poller = new MenuInputPoller(mode === '2p' && SETTINGS.p2Device === 'KEYBOARD');
    this.cols = roster.length + 1 > 24 ? 9 : 8;
  }

  run(): Promise<Selection> {
    injectMenuCss();
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.id = 'csel';
    this.el.style.setProperty('--cols', String(this.cols));
    document.body.appendChild(this.el);
    this.render();
    this.poller.start();
    this.stopListen = this.poller.listen((a) => this.onAction(a.action));
    return new Promise((res) => (this.resolve = res));
  }

  // ------------------------------------------------------------------ input
  private onAction(a: string): void {
    if (a === 'ok') menuAudio.play('catch_ok', { volume: 0.7 });
    else if (a === 'back') menuAudio.play('menu_cancel', { volume: 0.7 });
    else if (a === 'up' || a === 'down' || a === 'left' || a === 'right') menuAudio.play('menu_window', { volume: 0.5 });
    if (this.step === 'STAGE') {
      const n = this.stages.length, cols = 5;
      if (a === 'left') this.stageCursor = (this.stageCursor + n - 1) % n;
      else if (a === 'right') this.stageCursor = (this.stageCursor + 1) % n;
      else if (a === 'up') this.stageCursor = (this.stageCursor - cols + n) % n;
      else if (a === 'down') this.stageCursor = (this.stageCursor + cols) % n;
      else if (a === 'square') this.stageCursor = Math.floor(Math.random() * n);
      else if (a === 'ok' || a === 'start') { this.picks.STAGE = this.stages[this.stageCursor]; this.finish(); return; }
      else if (a === 'back') this.back();
      this.render();
      return;
    }
    if (this.step.endsWith('TYPE1') || this.step.endsWith('TYPE2')) {
      if (a === 'left') this.typeCursor = (this.typeCursor + 2) % 3;
      else if (a === 'right') this.typeCursor = (this.typeCursor + 1) % 3;
      else if (a === 'ok') { (this.picks as Record<string, unknown>)[this.step] = TYPES[this.typeCursor]; this.advance(); return; }
      else if (a === 'back') { this.back(); return; }
      this.render();
      return;
    }
    const n = this.roster.length + 1; // + random cell
    const cols = this.cols;
    const rows = Math.ceil(n / cols);
    let r = Math.floor(this.cursor / cols), c = this.cursor % cols;
    if (a === 'left') c = (c + cols - 1) % cols;
    else if (a === 'right') c = (c + 1) % cols;
    else if (a === 'up') r = (r + rows - 1) % rows;
    else if (a === 'down') r = (r + 1) % rows;
    else if (a === 'square') { this.cursor = n - 1; this.confirm(); return; }
    else if (a === 'ok') { this.confirm(); return; }
    else if (a === 'back') { this.back(); return; }
    else if (a === 'start') { this.render(); return; }
    let idx = r * cols + c;
    if (idx >= n) idx = a === 'down' ? c : n - 1;
    this.cursor = idx;
    this.render();
  }

  private teamOf(step: Step): CharacterDef[] {
    const p = step.startsWith('P1') ? ['P1_LEAD', 'P1_SUP1', 'P1_SUP2'] : ['P2_LEAD', 'P2_SUP1', 'P2_SUP2'];
    return p.map((k) => (this.picks as Record<string, CharacterDef | undefined>)[k]).filter((d): d is CharacterDef => !!d);
  }

  private confirm(): void {
    let def: CharacterDef;
    if (this.cursor === this.roster.length) {
      const taken = this.teamOf(this.step);
      const pool = this.roster.filter((d) => !taken.includes(d));
      def = pool[Math.floor(Math.random() * pool.length)];
    } else def = this.roster[this.cursor];
    // A team cannot repeat a character.
    if (this.teamOf(this.step).includes(def)) return this.shake();
    (this.picks as Record<string, unknown>)[this.step] = def;
    this.advance();
  }

  private advance(): void {
    const i = STEP_ORDER.indexOf(this.step);
    this.step = STEP_ORDER[i + 1];
    if (this.step.endsWith('TYPE1') || this.step.endsWith('TYPE2')) {
      const sup = (this.picks as Record<string, CharacterDef | undefined>)[this.step.replace('TYPE', 'SUP')];
      this.typeCursor = Math.max(0, TYPES.indexOf(sup?.supportType ?? 'ATTACK'));
    }
    this.render();
  }

  private back(): void {
    const i = STEP_ORDER.indexOf(this.step);
    if (i === 0) return;
    this.step = STEP_ORDER[i - 1];
    const prev = (this.picks as Record<string, unknown>)[this.step];
    if (prev && typeof prev === 'object' && 'code' in (prev as object)) this.cursor = Math.max(0, this.roster.indexOf(prev as CharacterDef));
    delete (this.picks as Record<string, unknown>)[this.step];
    this.render();
  }

  private shake(): void {
    const cell = this.el.querySelector('.cell.sel1, .cell.sel2') as HTMLElement | null;
    if (!cell) return;
    cell.animate([{ transform: 'scale(1.14) translateX(0)' }, { transform: 'scale(1.14) translateX(-6px)' }, { transform: 'scale(1.14) translateX(6px)' }, { transform: 'scale(1.14) translateX(0)' }], { duration: 180 });
    menuAudio.play('menu_cancel', { volume: 0.6 });
  }

  private finish(): void {
    const p = this.picks;
    const team = (lead: CharacterDef, s1: CharacterDef, s2: CharacterDef, t1: SupportType, t2: SupportType): TeamPick => ({ leader: lead, supports: [s1, s2], types: [t1, t2] });
    const sel: Selection = {
      mode: this.mode,
      p1: team(p.P1_LEAD!, p.P1_SUP1!, p.P1_SUP2!, p.P1_TYPE1!, p.P1_TYPE2!),
      p2: team(p.P2_LEAD!, p.P2_SUP1!, p.P2_SUP2!, p.P2_TYPE1!, p.P2_TYPE2!),
      stage: p.STAGE!,
    };
    const go = this.el.querySelector('.go') as HTMLElement;
    go.textContent = 'FIGHT';
    go.classList.add('show');
    this.stopListen?.();
    this.poller.stop();
    menuAudio.play('battleStart', { volume: 0.8 });
    setTimeout(() => { this.el.remove(); this.resolve(sel); }, 800);
  }

  // ------------------------------------------------------------------ view
  private render(): void {
    const p = this.picks;
    const side = this.step.startsWith('P2') ? 'p2' : 'p1';
    const who = this.step.startsWith('P2') ? (this.mode === '2p' ? '2P' : '2P (COM)') : '1P';
    const stepText: Record<Step, string> = {
      P1_LEAD: `<b>${who}</b> — choose your leader`, P1_SUP1: `<b>${who}</b> — choose support 1`, P1_TYPE1: `<b>${who}</b> — assist type for ${p.P1_SUP1?.displayName ?? ''}`, P1_SUP2: `<b>${who}</b> — choose support 2`, P1_TYPE2: `<b>${who}</b> — assist type for ${p.P1_SUP2?.displayName ?? ''}`,
      P2_LEAD: `<b>${who}</b> — choose the leader`, P2_SUP1: `<b>${who}</b> — choose support 1`, P2_TYPE1: `<b>${who}</b> — assist type for ${p.P2_SUP1?.displayName ?? ''}`, P2_SUP2: `<b>${who}</b> — choose support 2`, P2_TYPE2: `<b>${who}</b> — assist type for ${p.P2_SUP2?.displayName ?? ''}`,
      STAGE: 'choose the stage',
    };
    const picking = this.step !== 'STAGE' && !this.step.includes('TYPE');
    const focusDef = picking ? (this.cursor < this.roster.length ? this.roster[this.cursor] : null) : null;
    const p1Hero = side === 'p1' && focusDef ? focusDef : p.P1_LEAD ?? null;
    const p2Hero = side === 'p2' && focusDef ? focusDef : p.P2_LEAD ?? null;
    const hero = (s: 'p1' | 'p2', d: CharacterDef | null, active: boolean) => d ? `
      <div class="hero ${s} ${active ? '' : 'dim'}">
        <img src="${d.stand ?? d.vsFace ?? ''}" alt="">
        <div class="tag">${s === 'p1' ? '1P' : this.mode === '2p' ? '2P' : 'COM'}</div>
        <div class="plate"><div class="name">${d.displayName}</div><div class="sub">${d.title ?? ''}${d.jutsuName ? ' · ' + d.jutsuName : ''}</div></div>
      </div>` : '';
    const lock = (d: CharacterDef) => {
      const tags: string[] = [];
      if (p.P1_LEAD === d) tags.push('<span class="badge">1P</span>');
      if (p.P2_LEAD === d) tags.push('<span class="badge b2">2P</span>');
      if (p.P1_SUP1 === d || p.P1_SUP2 === d) tags.push('<span class="badge sup">1P SUP</span>');
      if (p.P2_SUP1 === d || p.P2_SUP2 === d) tags.push('<span class="badge sup b2">2P SUP</span>');
      return tags.join('');
    };
    const selClass = side === 'p1' ? 'sel1' : 'sel2';
    const cells = this.roster.map((d, i) => `<div class="cell ${i === this.cursor && picking ? selClass : ''}"><img src="${d.icon ?? ''}" alt="${d.displayName}">${lock(d)}</div>`).join('')
      + `<div class="cell rand ${this.cursor === this.roster.length && picking ? selClass : ''}">?</div>`;
    const stages = this.stages.map((s, i) => `<div class="stage ${i === this.stageCursor ? 'sel' : ''}" style="background-image:url(assets/ui/sel/stage_${s.id}.jpg)">${s.name}</div>`).join('');
    const types = TYPES.map((t, i) => `<div class="type ${i === this.typeCursor ? 'sel' : ''}"><div class="ico">${t === 'ATTACK' ? '⚔' : t === 'GUARD' ? '🛡' : '☯'}</div><h3>${TYPE_TEXT[t][0]}</h3><p>${TYPE_TEXT[t][1]}</p></div>`).join('');
    const slot = (d: CharacterDef | undefined, label: string, lead = false, t?: SupportType) => `<div class="slot ${lead ? 'lead' : ''}">${d ? `<img src="${d.icon}" alt="">` : ''}${t ? `<span class="t">${t}</span>` : ''}<span>${label}</span></div>`;
    const teamRow = (s: 'p1' | 'p2') => s === 'p1'
      ? `${slot(p.P1_LEAD, 'LEADER', true)}${slot(p.P1_SUP1, 'SUPPORT 1', false, p.P1_TYPE1)}${slot(p.P1_SUP2, 'SUPPORT 2', false, p.P1_TYPE2)}`
      : `${slot(p.P2_LEAD, 'LEADER', true)}${slot(p.P2_SUP1, 'SUPPORT 1', false, p.P2_TYPE1)}${slot(p.P2_SUP2, 'SUPPORT 2', false, p.P2_TYPE2)}`;
    const middle = this.step === 'STAGE' ? `<div class="stages">${stages}</div>` : this.step.includes('TYPE') ? `<div class="types">${types}</div>` : `<div class="grid">${cells}</div>`;
    const modeLabel = this.mode === '2p' ? 'VS PLAYER' : this.mode === 'training' ? 'TRAINING' : 'VS COM';
    this.el.innerHTML = `
      <img class="title" src="assets/ui/sel/title.png" alt="Character Select">
      <div class="stepline">${stepText[this.step]}</div>
      <div class="mode">${modeLabel}</div>
      ${hero('p1', p1Hero, side === 'p1' && this.step !== 'STAGE')}
      ${hero('p2', p2Hero, side === 'p2' && this.step !== 'STAGE')}
      ${middle}
      <div class="team p1">${teamRow('p1')}</div>
      <div class="team p2">${teamRow('p2')}</div>
      <div class="help">STICK / WASD move · CROSS / J confirm · CIRCLE / K back · SQUARE / H random · ${this.step === 'STAGE' ? 'pick a stage to fight' : this.step.includes('TYPE') ? 'assists trigger automatically by type; L1 / R1 call them' : 'leader + two supports per side'}</div>
      <div class="go"></div>`;
  }
}

/** Storm-style VS splash: both teams' portraits crossing, red vs blue brush plates. Returns a fade-out function. */
export function showVsSplash(sel: Selection): () => void {
  const css = `
  #vs { position:absolute; inset:0; z-index:25; overflow:hidden; font-family:'Segoe UI', system-ui, sans-serif; color:#fff; background:#05070f; }
  #vs .half { position:absolute; top:0; bottom:0; width:56%; overflow:hidden; }
  #vs .half.l { left:-4%; background:linear-gradient(100deg, #b3261e, #ff6a3c); clip-path:polygon(0 0, 100% 0, 88% 100%, 0 100%); animation: vsL .5s cubic-bezier(.2,.9,.3,1) both; }
  #vs .half.r { right:-4%; background:linear-gradient(260deg, #1e4fb3, #3cb8ff); clip-path:polygon(12% 0, 100% 0, 100% 100%, 0 100%); animation: vsR .5s cubic-bezier(.2,.9,.3,1) both; }
  @keyframes vsL { from { transform:translateX(-100%) } to { transform:none } }
  @keyframes vsR { from { transform:translateX(100%) } to { transform:none } }
  #vs .face { position:absolute; bottom:0; height:96%; filter:drop-shadow(0 10px 20px rgba(0,0,0,.5)); animation: vsFace .6s .15s ease-out both; }
  #vs .half.l .face { left:6%; } #vs .half.r .face { right:6%; transform:scaleX(-1); }
  @keyframes vsFace { from { opacity:0; transform:translateY(4vh) } to { opacity:1; transform:none } }
  #vs .half.r .face { animation-name: vsFaceR; }
  @keyframes vsFaceR { from { opacity:0; transform:scaleX(-1) translateY(4vh) } to { opacity:1; transform:scaleX(-1) } }
  #vs .name { position:absolute; bottom:8vh; font-size:4vh; font-weight:900; letter-spacing:.18em; text-shadow:0 3px 8px #000; padding:1vh 3vh; background:rgba(0,0,0,.35); animation: stmFade .4s .35s both; }
  #vs .half.l .name { left:6%; } #vs .half.r .name { right:6%; text-align:right; }
  #vs .name small { display:block; font-size:1.6vh; letter-spacing:.3em; opacity:.85; }
  #vs .sup { display:flex; gap:1vh; margin-top:1vh; } #vs .half.r .sup { justify-content:flex-end; }
  #vs .sup img { width:6vh; height:6vh; border-radius:.8vh; box-shadow:0 0 0 .3vh rgba(255,255,255,.5); }
  #vs .vs { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); font-size:16vh; font-weight:900; font-style:italic; letter-spacing:.05em; text-shadow:0 0 40px rgba(255,255,255,.7), 0 6px 10px #000; animation: vsPop .45s .3s cubic-bezier(.2,1.5,.4,1) both; }
  @keyframes vsPop { from { opacity:0; transform:translate(-50%,-50%) scale(3) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }
  #vs .stage { position:absolute; left:50%; bottom:3vh; transform:translateX(-50%); font-size:2vh; letter-spacing:.4em; opacity:.9; animation: stmFade .5s .6s both; }
  #vs.out { animation: vsOut .35s ease-in forwards; }
  @keyframes vsOut { to { opacity:0 } }`;
  injectMenuCss();
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const sups = (t: TeamPick) => t.supports.map((s) => `<img src="${s.icon ?? ''}" alt="">`).join('');
  const box = el(`<div id="vs">
    <div class="half l"><img class="face" src="${sel.p1.leader.vsFace ?? sel.p1.leader.stand ?? ''}" alt=""><div class="name"><small>1P · LEADER</small>${sel.p1.leader.displayName}<div class="sup">${sups(sel.p1)}</div></div></div>
    <div class="half r"><img class="face" src="${sel.p2.leader.vsFace ?? sel.p2.leader.stand ?? ''}" alt=""><div class="name"><small>${sel.mode === '2p' ? '2P' : 'COM'} · LEADER</small>${sel.p2.leader.displayName}<div class="sup">${sups(sel.p2)}</div></div></div>
    <div class="vs">VS</div><div class="stage">${sel.stage.name}</div></div>`);
  document.body.appendChild(box);
  return () => { box.classList.add('out'); setTimeout(() => box.remove(), 400); };
}
