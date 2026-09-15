/**
 * MenuKit.ts — shared plumbing for the DOM screens (title, main menu, options, move list, pause,
 * results, character select): one input poller that merges the keyboard with every connected pad
 * (edge-triggered, with stick repeat), the Storm-style CSS, and small builders.
 */
import { GamepadState, PAD } from '../core/GamepadState';
import { AudioManager } from '../audio/AudioManager';

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'start' | 'l1' | 'r1' | 'l2' | 'r2' | 'square' | 'triangle';
export interface MenuInput { action: MenuAction; player: 1 | 2; }

export const menuAudio = new AudioManager();

const KEYMAP_P1: Record<string, MenuAction> = {
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', KeyJ: 'ok', Enter: 'ok', Space: 'ok', KeyK: 'back', Backspace: 'back', Escape: 'back',
  KeyP: 'start', KeyQ: 'l1', KeyE: 'r1', KeyH: 'square', KeyU: 'triangle', KeyY: 'l1', KeyT: 'r1',
};
const KEYMAP_P2: Record<string, MenuAction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Numpad1: 'ok', NumpadEnter: 'ok', Numpad3: 'back', Numpad0: 'ok', Numpad2: 'back',
  Numpad7: 'l1', Numpad9: 'r1', Numpad5: 'square', Numpad4: 'triangle',
};

/**
 * Polls both pads every animation frame and turns keyboard + pad edges into menu actions.
 * `p2Keys` routes the arrow / numpad cluster to player 2 (2P mode); otherwise arrows are 1P.
 */
export class MenuInputPoller {
  private pads = [new GamepadState(0), new GamepadState(1)];
  private queue: MenuInput[] = [];
  private raf = 0;
  private repeat = [0, 0];
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);
  constructor(private p2Keys = false) {}

  start(): void {
    window.addEventListener('keydown', this.keyHandler);
    const loop = () => { this.pollPads(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  stop(): void {
    window.removeEventListener('keydown', this.keyHandler);
    cancelAnimationFrame(this.raf);
    this.queue.length = 0;
  }
  /** Drain queued actions (call once per frame from the screen's own loop). */
  take(): MenuInput[] { const q = this.queue; this.queue = []; return q; }
  /** Attach a per-action callback and its own frame loop; returns a stop function. */
  listen(fn: (a: MenuInput) => void): () => void {
    let raf = 0;
    const loop = () => { for (const a of this.take()) fn(a); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (this.p2Keys && KEYMAP_P2[e.code]) { this.queue.push({ action: KEYMAP_P2[e.code], player: 2 }); e.preventDefault(); return; }
    const a = KEYMAP_P1[e.code] ?? (e.code.startsWith('Arrow') ? ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as Record<string, MenuAction>)[e.code] : undefined);
    if (a) { this.queue.push({ action: a, player: 1 }); e.preventDefault(); }
  }

  private pollPads(): void {
    for (let i = 0; i < 2; i++) {
      const pad = this.pads[i];
      const s = pad.poll();
      if (!s.connected) continue;
      const player = (i + 1) as 1 | 2;
      const push = (action: MenuAction) => this.queue.push({ action, player });
      if (pad.justPressed(PAD.CROSS)) push('ok');
      if (pad.justPressed(PAD.CIRCLE)) push('back');
      if (pad.justPressed(PAD.OPTIONS)) push('start');
      if (pad.justPressed(PAD.L1)) push('l1');
      if (pad.justPressed(PAD.R1)) push('r1');
      if (pad.justPressed(PAD.L2)) push('l2');
      if (pad.justPressed(PAD.R2)) push('r2');
      if (pad.justPressed(PAD.SQUARE)) push('square');
      if (pad.justPressed(PAD.TRIANGLE)) push('triangle');
      if (pad.justPressed(PAD.DPAD_UP)) push('up');
      if (pad.justPressed(PAD.DPAD_DOWN)) push('down');
      if (pad.justPressed(PAD.DPAD_LEFT)) push('left');
      if (pad.justPressed(PAD.DPAD_RIGHT)) push('right');
      // stick with auto-repeat
      const now = performance.now();
      const dir: MenuAction | null = s.ly > 0.6 ? 'up' : s.ly < -0.6 ? 'down' : s.lx < -0.6 ? 'left' : s.lx > 0.6 ? 'right' : null;
      if (dir) {
        if (now > this.repeat[i]) { push(dir); this.repeat[i] = now + (this.repeat[i] === 0 ? 320 : 130); }
      } else this.repeat[i] = 0;
    }
  }
}

/** Storm-flavoured shared styles for every DOM screen. */
export const MENU_CSS = `
.stm-screen { position:absolute; inset:0; z-index:30; font-family:'Segoe UI', system-ui, sans-serif; color:#fff; user-select:none; overflow:hidden; }
.stm-dim { position:absolute; inset:0; background:radial-gradient(ellipse at 50% 40%, rgba(10,14,30,.25), rgba(4,6,14,.85)); }
.stm-brush { position:absolute; left:-4vw; top:8vh; width:60vw; height:14vh; background:url(assets/ui/sel/brush_red.png) left center/100% 100% no-repeat; opacity:.9; transform:skewX(-8deg); }
.stm-title { position:absolute; left:6vw; top:9.5vh; font-size:7vh; font-weight:900; letter-spacing:.18em; text-shadow:0 4px 12px rgba(0,0,0,.7), 0 0 30px rgba(255,150,80,.5); font-style:italic; }
.stm-sub { position:absolute; left:6.4vw; top:19vh; font-size:2vh; letter-spacing:.5em; opacity:.8; text-transform:uppercase; }
.stm-list { position:absolute; left:8vw; top:32vh; display:flex; flex-direction:column; gap:1.6vh; }
.stm-item { position:relative; font-size:3.6vh; font-weight:800; letter-spacing:.14em; padding:1.2vh 4vh 1.2vh 3vh; min-width:34vw; color:rgba(255,255,255,.7); transform:skewX(-8deg); background:linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,0)); transition:transform .12s, color .12s, background .12s; }
.stm-item .hint { display:block; font-size:1.5vh; font-weight:500; letter-spacing:.2em; opacity:.7; margin-top:.3vh; }
.stm-item.sel { color:#fff; transform:skewX(-8deg) translateX(2vw) scale(1.04); background:linear-gradient(90deg, rgba(220,60,30,.9), rgba(255,120,60,.25) 70%, rgba(0,0,0,0)); box-shadow:0 0 30px rgba(255,120,60,.35); }
.stm-item.sel::before { content:''; position:absolute; left:-1.6vh; top:50%; width:1vh; height:60%; transform:translateY(-50%); background:#ffd166; box-shadow:0 0 12px #ffd166; }
.stm-item.off { opacity:.35; }
.stm-help { position:absolute; bottom:2vh; left:50%; transform:translateX(-50%); font-size:1.6vh; letter-spacing:.14em; opacity:.85; white-space:nowrap; text-shadow:0 1px 3px #000; }
.stm-help b { display:inline-block; padding:.1vh .9vh; border:1px solid rgba(255,255,255,.6); border-radius:.6vh; margin:0 .4vh; font-weight:700; }
.stm-panel { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); min-width:56vw; max-width:90vw; max-height:84vh; overflow:auto; background:linear-gradient(180deg, rgba(12,16,30,.94), rgba(6,8,16,.96)); border:1px solid rgba(255,255,255,.18); box-shadow:0 30px 80px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.05); padding:3vh 4vh; border-radius:1vh; }
.stm-panel h1 { margin:0 0 2vh; font-size:3.4vh; letter-spacing:.3em; font-weight:900; font-style:italic; color:#ffd166; text-shadow:0 2px 8px rgba(0,0,0,.6); }
.stm-row { display:flex; justify-content:space-between; align-items:center; padding:1.1vh 1.6vh; font-size:2.2vh; letter-spacing:.08em; border-radius:.6vh; color:rgba(255,255,255,.8); }
.stm-row.sel { background:linear-gradient(90deg, rgba(220,60,30,.75), rgba(220,60,30,.1)); color:#fff; }
.stm-row .val { font-weight:800; min-width:18vw; text-align:right; color:#ffd166; }
.stm-row .val::before { content:'◀ '; opacity:.5; } .stm-row .val::after { content:' ▶'; opacity:.5; }
.stm-row.sel .val::before, .stm-row.sel .val::after { opacity:1; }
.stm-fade { animation: stmFade .35s ease-out both; }
@keyframes stmFade { from { opacity:0; transform:translateY(1vh); } to { opacity:1; transform:none; } }
.stm-press { position:absolute; left:50%; bottom:18vh; transform:translateX(-50%); font-size:2.6vh; letter-spacing:.5em; animation: stmBlink 1.4s ease-in-out infinite; text-shadow:0 0 16px rgba(255,255,255,.6); }
@keyframes stmBlink { 0%,100% { opacity:.25 } 50% { opacity:1 } }
.stm-logo { position:absolute; left:50%; top:22vh; transform:translateX(-50%); text-align:center; }
.stm-logo .big { font-size:13vh; font-weight:900; letter-spacing:.08em; font-style:italic; line-height:1; background:linear-gradient(180deg,#fff 20%,#ffd166 55%,#ff5a2c 100%); -webkit-background-clip:text; background-clip:text; color:transparent; filter:drop-shadow(0 6px 0 #2a0a05) drop-shadow(0 12px 30px rgba(0,0,0,.7)); animation: stmLogo 1.1s cubic-bezier(.2,1.4,.4,1) both; }
.stm-logo .small { font-size:2.4vh; letter-spacing:.9em; margin-top:1vh; opacity:.9; text-shadow:0 2px 8px #000; animation: stmFade .8s .5s both; }
.stm-logo .tag { font-size:1.6vh; letter-spacing:.4em; margin-top:2vh; opacity:.6; animation: stmFade .8s .8s both; }
@keyframes stmLogo { from { transform:scale(2.6); opacity:0; filter:blur(12px); } to { transform:scale(1); opacity:1; filter:drop-shadow(0 6px 0 #2a0a05) drop-shadow(0 12px 30px rgba(0,0,0,.7)); } }
.stm-corner { position:absolute; right:2vw; bottom:2vh; font-size:1.4vh; letter-spacing:.2em; opacity:.5; text-align:right; }
.stm-lines { position:absolute; inset:0; pointer-events:none; background:repeating-linear-gradient(180deg, rgba(255,255,255,.025) 0 2px, rgba(0,0,0,0) 2px 6px); mix-blend-mode:overlay; }
.stm-glow { position:absolute; left:50%; top:50%; width:120vw; height:120vh; transform:translate(-50%,-50%); background:radial-gradient(circle at 50% 45%, rgba(255,140,60,.18), rgba(0,0,0,0) 45%); pointer-events:none; animation: stmPulse 4s ease-in-out infinite; }
@keyframes stmPulse { 0%,100% { opacity:.6 } 50% { opacity:1 } }
`;

let cssInjected = false;
export function injectMenuCss(): void {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement('style');
  style.textContent = MENU_CSS;
  document.head.appendChild(style);
}

export function el(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
}

/** Vertical list menu: returns the chosen index (or -1 on back). */
export function listMenu(container: HTMLElement, items: { label: string; hint?: string; disabled?: boolean }[], poller: MenuInputPoller, opts: { start?: number; allowBack?: boolean; onMove?: (i: number) => void } = {}): Promise<number> {
  const list = el(`<div class="stm-list stm-fade"></div>`);
  container.appendChild(list);
  let idx = opts.start ?? 0;
  const render = () => {
    list.innerHTML = items.map((it, i) => `<div class="stm-item ${i === idx ? 'sel' : ''} ${it.disabled ? 'off' : ''}">${it.label}${it.hint ? `<span class="hint">${it.hint}</span>` : ''}</div>`).join('');
  };
  render();
  return new Promise((resolve) => {
    const stop = poller.listen((a) => {
      if (a.action === 'up' || a.action === 'down') {
        idx = (idx + (a.action === 'up' ? -1 : 1) + items.length) % items.length;
        menuAudio.play('menu_window', { volume: 0.5 });
        opts.onMove?.(idx);
        render();
      } else if (a.action === 'ok' || a.action === 'start') {
        if (items[idx].disabled) { menuAudio.play('menu_cancel', { volume: 0.5 }); return; }
        menuAudio.play('catch_ok', { volume: 0.7 });
        stop(); list.remove(); resolve(idx);
      } else if (a.action === 'back' && opts.allowBack !== false) {
        menuAudio.play('menu_cancel', { volume: 0.6 });
        stop(); list.remove(); resolve(-1);
      }
    });
  });
}
