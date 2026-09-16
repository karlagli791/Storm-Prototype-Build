/**
 * Screens.ts — the front end around the battle: title (press start), main menu, options, move
 * list, pause menu and the results screen. All DOM overlays on top of the live 3D scene (the
 * title runs an attract-mode demo battle underneath, blurred), driven by MenuKit's poller.
 */
import { CharacterDef, SupportType } from '../core/Types';
import { SETTINGS, saveSettings, resetSettings, Difficulty } from '../core/Settings';
import { MenuInputPoller, injectMenuCss, el, listMenu, menuAudio } from './MenuKit';

export type MainChoice = 'cpu' | '2p' | 'training' | 'movelist' | 'options' | 'credits';

const HELP = `<div class="stm-help"><b>STICK</b> move <b>✕ / J</b> confirm <b>○ / K</b> back</div>`;

function screen(extra = ''): HTMLElement {
  injectMenuCss();
  const s = el(`<div class="stm-screen"><div class="stm-dim"></div><div class="stm-glow"></div><div class="stm-lines"></div>${extra}</div>`);
  document.body.appendChild(s);
  return s;
}

/** Title: logo slam, "press any button". Resolves when a button is pressed. */
export function runTitle(): Promise<void> {
  const s = screen(`
    <div class="stm-logo"><div class="big">STORM</div><div class="small">PROTOTYPE BUILD</div><div class="tag">NARUTO SHIPPUDEN · ULTIMATE NINJA</div></div>
    <div class="stm-press">PRESS ANY BUTTON</div>
    <div class="stm-corner">v0.8.0 · 36 FIGHTERS · TEAM OF THREE · 2 PLAYERS<br>real CC2 assets · Storm 4 frame data · One Piece: Fighting Path models</div>`);
  const poller = new MenuInputPoller();
  poller.start();
  return new Promise((resolve) => {
    const stop = poller.listen((a) => {
      if (a.action === 'ok' || a.action === 'start') {
        menuAudio.play('catch_ok', { volume: 0.8 });
        stop(); poller.stop();
        s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
        setTimeout(() => { s.remove(); resolve(); }, 300);
      }
    });
  });
}

/** Main menu. */
export async function runMainMenu(): Promise<MainChoice> {
  const s = screen(`
    <div class="stm-brush"></div><div class="stm-title">MAIN MENU</div><div class="stm-sub">choose a mode</div>${HELP}`);
  const poller = new MenuInputPoller();
  poller.start();
  const items: { label: string; hint: string; key: MainChoice }[] = [
    { label: 'FREE BATTLE · VS COM', hint: 'team of three against the CPU', key: 'cpu' },
    { label: 'FREE BATTLE · VS PLAYER', hint: 'two controllers (or pad + keyboard)', key: '2p' },
    { label: 'TRAINING', hint: 'standing dummy, infinite time, health regen', key: 'training' },
    { label: 'MOVE LIST', hint: 'every string, jutsu and ultimate per character', key: 'movelist' },
    { label: 'OPTIONS', hint: 'audio, difficulty, camera, effects, controls', key: 'options' },
    { label: 'CREDITS', hint: 'what this build is made of', key: 'credits' },
  ];
  let idx = -1;
  while (idx < 0) idx = await listMenu(s, items, poller, { allowBack: false });
  poller.stop();
  s.remove();
  return items[idx].key;
}

/** Options screen. */
export async function runOptions(inBattle = false): Promise<void> {
  const s = screen(`<div class="stm-brush"></div><div class="stm-title">OPTIONS</div><div class="stm-sub">left / right to change · ○ back</div>${HELP}`);
  const poller = new MenuInputPoller();
  poller.start();
  const panel = el(`<div class="stm-panel stm-fade" style="top:56%"><h1>SETTINGS</h1><div class="rows"></div></div>`);
  s.appendChild(panel);
  const rows = panel.querySelector('.rows') as HTMLElement;
  type Row = { label: string; get: () => string; step: (d: number) => void };
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const diffs: Difficulty[] = ['EASY', 'NORMAL', 'HARD', 'ULTIMATE'];
  const times: Array<60 | 99 | 120 | 0> = [60, 99, 120, 0];
  const defs: Row[] = [
    { label: 'MASTER VOLUME', get: () => pct(SETTINGS.master), step: (d) => (SETTINGS.master = clamp(SETTINGS.master + d * 0.05, 0, 1)) },
    { label: 'MUSIC', get: () => pct(SETTINGS.music), step: (d) => (SETTINGS.music = clamp(SETTINGS.music + d * 0.05, 0, 1)) },
    { label: 'SOUND EFFECTS', get: () => pct(SETTINGS.sfx), step: (d) => (SETTINGS.sfx = clamp(SETTINGS.sfx + d * 0.05, 0, 1)) },
    { label: 'VOICES', get: () => pct(SETTINGS.voice), step: (d) => (SETTINGS.voice = clamp(SETTINGS.voice + d * 0.05, 0, 1)) },
    { label: 'COM DIFFICULTY', get: () => SETTINGS.difficulty, step: (d) => (SETTINGS.difficulty = diffs[(diffs.indexOf(SETTINGS.difficulty) + d + diffs.length) % diffs.length]) },
    { label: 'ROUND TIME', get: () => (SETTINGS.roundTime === 0 ? '∞' : `${SETTINGS.roundTime} s`), step: (d) => (SETTINGS.roundTime = times[(times.indexOf(SETTINGS.roundTime) + d + times.length) % times.length]) },
    { label: 'CAMERA DISTANCE', get: () => `${Math.round(SETTINGS.cameraScale * 100)} %`, step: (d) => (SETTINGS.cameraScale = clamp(+(SETTINGS.cameraScale + d * 0.05).toFixed(2), 0.7, 1.4)) },
    { label: 'BATTLE MUSIC', get: () => (SETTINGS.bgmTrack === 0 ? 'PER STAGE' : `TRACK ${SETTINGS.bgmTrack}`), step: (d) => (SETTINGS.bgmTrack = (SETTINGS.bgmTrack + d + 17) % 17) },
    { label: 'SCREEN EFFECTS', get: () => (SETTINGS.postFx ? 'ON' : 'OFF'), step: () => (SETTINGS.postFx = !SETTINGS.postFx) },
    { label: 'INK OUTLINES', get: () => (SETTINGS.outlines ? 'ON' : 'OFF'), step: () => (SETTINGS.outlines = !SETTINGS.outlines) },
    { label: 'SHADOWS', get: () => (SETTINGS.shadows ? 'ON' : 'OFF'), step: () => (SETTINGS.shadows = !SETTINGS.shadows) },
    { label: '2P DEVICE', get: () => (SETTINGS.p2Device === 'PAD2' ? 'SECOND PAD' : 'KEYBOARD (ARROWS + NUMPAD)'), step: () => (SETTINGS.p2Device = SETTINGS.p2Device === 'PAD2' ? 'KEYBOARD' : 'PAD2') },
    { label: 'HUD SIZE', get: () => `${Math.round(SETTINGS.hudScale * 100)} %`, step: (d) => (SETTINGS.hudScale = clamp(+(SETTINGS.hudScale + d * 0.1).toFixed(1), 0.7, 1.3)) },
    { label: 'RESET TO DEFAULTS', get: () => '↺', step: () => resetSettings() },
  ];
  let idx = 0;
  const render = () => {
    rows.innerHTML = defs.map((r, i) => `<div class="stm-row ${i === idx ? 'sel' : ''}"><span>${r.label}</span><span class="val">${r.get()}</span></div>`).join('');
  };
  render();
  await new Promise<void>((resolve) => {
    const stop = poller.listen((a) => {
      if (a.action === 'up' || a.action === 'down') { idx = (idx + (a.action === 'up' ? -1 : 1) + defs.length) % defs.length; menuAudio.play('menu_window', { volume: 0.5 }); render(); }
      else if (a.action === 'left' || a.action === 'right' || a.action === 'ok') { defs[idx].step(a.action === 'left' ? -1 : 1); saveSettings(); menuAudio.play('menu_window', { volume: 0.5 }); render(); }
      else if (a.action === 'back' || a.action === 'start') { menuAudio.play('menu_cancel', { volume: 0.6 }); stop(); resolve(); }
    });
  });
  poller.stop();
  s.remove();
  void inBattle;
}

// --------------------------------------------------------------------------------------------
// Move list
// --------------------------------------------------------------------------------------------
const GLYPH = { circle: '○', cross: '✕', square: '□', triangle: '△', up: '↑', down: '↓', l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2', r3: 'R3' };

function moveRows(d: CharacterDef): string {
  const hits = (moves: { hitboxes: { damage: number }[] }[]) => moves.reduce((n, m) => n + m.hitboxes.length, 0);
  const dmg = (moves: { hitboxes: { damage: number }[] }[]) => moves.reduce((n, m) => n + m.hitboxes.reduce((a, h) => a + h.damage, 0), 0);
  const row = (name: string, input: string, note: string) => `<div class="stm-row"><span><b>${name}</b><br><small style="opacity:.7">${note}</small></span><span style="font-weight:800;letter-spacing:.2em;color:#ffd166">${input}</span></div>`;
  const rows: string[] = [];
  // One Piece fighters run the Fighting Path layout: four skills on L1, the finisher on R1 + ○.
  if (d.opbr) {
    const o = d.opbr;
    if (o.style) rows.push(`<div class="stm-row"><span style="opacity:.85">${o.style}</span><span style="color:#8adfff;font-weight:800;letter-spacing:.2em">ONE PIECE</span></div>`);
    rows.push(row('Combo string', `${GLYPH.circle} ${GLYPH.circle} ${GLYPH.circle} ${GLYPH.circle}`, `${d.neutralString.moves.length} hits · ${GLYPH.up}${GLYPH.circle} launcher · ${GLYPH.down}${GLYPH.circle} tilt · air string`));
    const btn = [`${GLYPH.l1} + ${GLYPH.circle}`, `${GLYPH.l1} + ${GLYPH.triangle}`, `${GLYPH.l1} + ${GLYPH.square}`, `${GLYPH.l1} + ${GLYPH.cross}`];
    o.skills.forEach((sk, i) => rows.push(row(sk.name, btn[i] ?? `S${i + 1}`, `${sk.desc} · ${sk.cost}% gauge · ${sk.cooldown}s cooldown`)));
    rows.push(row(o.ultimate.name, `${GLYPH.r1} + ${GLYPH.circle} (full gauge)`, o.ultimate.desc));
    rows.push(row('Armament Haki', `${GLYPH.r1} + ${GLYPH.triangle}`, '12 s · +25 % damage, skills gain super armour'));
    rows.push(row('Observation step', `${GLYPH.l2} + stick flick`, 'short invulnerable sidestep'));
    rows.push(row(`${o.gaugeName ?? 'HAKI'} gauge`, `${GLYPH.triangle} hold`, 'charge it standing still; skills spend it'));
    rows.push(row('Guard · substitution', `${GLYPH.l2} · ${GLYPH.l2} in hitstun`, 'shared with the Storm side'));
    rows.push(row('Keyboard', '1 2 3 4 · 5 · R · F', 'skills · finisher · Haki · step'));
    rows.push(row('Supports', `${GLYPH.l1} / ${GLYPH.r1} on their own`, 'a shoulder without a face button still calls the assist'));
    return rows.join('');
  }
  rows.push(row('Neutral string', `${GLYPH.circle} ${GLYPH.circle} ${GLYPH.circle} ${GLYPH.circle}`, `${d.neutralString.moves.length} moves · ${hits(d.neutralString.moves)} hits · ${dmg(d.neutralString.moves)} dmg`));
  rows.push(row('Up string (launcher)', `${GLYPH.circle} ${GLYPH.up}${GLYPH.circle} ${GLYPH.up}${GLYPH.circle}`, `${d.upString.moves.length} moves · ends in a launch`));
  rows.push(row('Down string (tilt)', `${GLYPH.circle} ${GLYPH.down}${GLYPH.circle} ${GLYPH.down}${GLYPH.circle}`, `${d.downString.moves.length} moves`));
  if (d.airString) rows.push(row('Air string', `(air) ${GLYPH.circle} ${GLYPH.circle} ${GLYPH.circle}`, `${d.airString.moves.length} moves · last hit spikes`));
  rows.push(row('Ranged / shuriken', `${GLYPH.square}`, 'ground, air and out of a ninja move'));
  rows.push(row(d.jutsuName ?? 'Jutsu', `${GLYPH.triangle} + ${GLYPH.circle}`, `30 % chakra · ${d.jutsuProjectile ? 'projectile' : 'melee, plays the demo on contact'}`));
  rows.push(row(d.ultimateName ?? 'Ultimate jutsu', `${GLYPH.triangle} + ${GLYPH.circle} (full gauge)`, 'cut-in → rush → cinematic'));
  rows.push(row('Awakening', `hold ${GLYPH.triangle} at ≤ 50 % health`, `${d.awakenedCode ? 'full awakened form' : 'chakra aura · +30 % damage'}`));
  rows.push(row('Chakra dash / charged', `${GLYPH.triangle} + ${GLYPH.cross} · hold`, 'spark dash mid-string, turbo dash after an attack'));
  rows.push(row('Ninja move', `${GLYPH.cross} + direction (running)`, 'side hop · shuriken cancels it'));
  rows.push(row('Guard · counter · substitution', `${GLYPH.l2} · ${GLYPH.l2}+${GLYPH.circle} · ${GLYPH.l2} in hitstun`, 'guard break counter costs 20 % chakra'));
  rows.push(row('Supports · leader switch', `${GLYPH.l1} / ${GLYPH.r1} · ${GLYPH.r3}`, 'attack / guard / balance assists'));
  return rows.join('');
}

/** Move list browser: left/right cycles characters. */
export async function runMoveList(roster: CharacterDef[], start = 0): Promise<void> {
  const s = screen(`<div class="stm-brush"></div><div class="stm-title">MOVE LIST</div><div class="stm-sub">◀ ▶ character · ○ back</div>${HELP}`);
  const poller = new MenuInputPoller();
  poller.start();
  const panel = el(`<div class="stm-panel stm-fade" style="top:56%;min-width:62vw"><div class="head" style="display:flex;align-items:center;gap:2vh;margin-bottom:1.5vh"></div><div class="rows"></div></div>`);
  s.appendChild(panel);
  let i = start;
  const render = () => {
    const d = roster[i];
    (panel.querySelector('.head') as HTMLElement).innerHTML = `<img src="${d.icon ?? ''}" style="width:9vh;height:9vh;border-radius:1vh;box-shadow:0 0 0 .3vh rgba(255,255,255,.4)"><div><h1 style="margin:0">${d.displayName}</h1><div style="opacity:.75;letter-spacing:.2em;font-size:1.6vh">${d.title ?? ''}</div></div><div style="margin-left:auto;opacity:.6;letter-spacing:.2em">${i + 1} / ${roster.length}</div>`;
    (panel.querySelector('.rows') as HTMLElement).innerHTML = moveRows(d);
  };
  render();
  await new Promise<void>((resolve) => {
    const stop = poller.listen((a) => {
      if (a.action === 'left' || a.action === 'right' || a.action === 'l1' || a.action === 'r1') { i = (i + (a.action === 'left' || a.action === 'l1' ? -1 : 1) + roster.length) % roster.length; menuAudio.play('menu_window', { volume: 0.5 }); render(); }
      else if (a.action === 'back' || a.action === 'start' || a.action === 'ok') { menuAudio.play('menu_cancel', { volume: 0.6 }); stop(); resolve(); }
    });
  });
  poller.stop();
  s.remove();
}

/** Credits. */
export async function runCredits(): Promise<void> {
  const s = screen(`<div class="stm-brush"></div><div class="stm-title">CREDITS</div>${HELP}`);
  const poller = new MenuInputPoller();
  poller.start();
  s.appendChild(el(`<div class="stm-panel stm-fade" style="top:58%"><h1>STORM PROTOTYPE BUILD</h1>
    <div class="stm-row"><span>Engine</span><span class="val" style="color:#fff">TypeScript · Three.js · Electron</span></div>
    <div class="stm-row"><span>Characters, stages, animations, cameras</span><span class="val" style="color:#fff">CyberConnect2 · Ultimate Ninja STORM 2 / 3 / 4</span></div>
    <div class="stm-row"><span>Frame data</span><span class="val" style="color:#fff">STORM 4 character parameter tables</span></div>
    <div class="stm-row"><span>Sound, voices, music</span><span class="val" style="color:#fff">STORM 2 & 4 sound banks</span></div>
    <div class="stm-row"><span>Sprite effects</span><span class="val" style="color:#fff">Kenney (CC0)</span></div>
    <div class="stm-row"><span>Tools</span><span class="val" style="color:#fff">Blender XFBIN add-on · vgmstream · ffmpeg</span></div>
    <div class="stm-row"><span>Fan project</span><span class="val" style="color:#fff">not affiliated with Bandai Namco</span></div></div>`));
  await new Promise<void>((resolve) => { const stop = poller.listen((a) => { if (a.action === 'back' || a.action === 'ok' || a.action === 'start') { stop(); resolve(); } }); });
  poller.stop();
  s.remove();
}

// --------------------------------------------------------------------------------------------
// Pause + results (used from the battle)
// --------------------------------------------------------------------------------------------
export type PauseChoice = 'resume' | 'movelist' | 'options' | 'select' | 'title';
export async function runPause(roster: CharacterDef[], currentIndex: number): Promise<PauseChoice> {
  const s = screen(`<div class="stm-brush"></div><div class="stm-title">PAUSE</div>${HELP}`);
  const poller = new MenuInputPoller();
  poller.start();
  const items: { label: string; hint?: string; key: PauseChoice }[] = [
    { label: 'RESUME', key: 'resume' },
    { label: 'MOVE LIST', hint: 'your leader\'s commands', key: 'movelist' },
    { label: 'OPTIONS', key: 'options' },
    { label: 'CHARACTER SELECT', key: 'select' },
    { label: 'TITLE SCREEN', key: 'title' },
  ];
  let choice: PauseChoice = 'resume';
  for (;;) {
    const idx = await listMenu(s, items, poller, { allowBack: true });
    choice = idx < 0 ? 'resume' : items[idx].key;
    if (choice === 'movelist') { poller.stop(); await runMoveList(roster, currentIndex); poller.start(); continue; }
    if (choice === 'options') { poller.stop(); await runOptions(true); poller.start(); continue; }
    break;
  }
  poller.stop();
  s.remove();
  return choice;
}

export type ResultChoice = 'rematch' | 'select' | 'title';
export interface ResultStats { winner: string; loser: string; winnerPortrait: string | null; time: number; maxCombo: number; damage: number; perfect: boolean; }
export async function runResults(r: ResultStats): Promise<ResultChoice> {
  const s = screen(`
    <div style="position:absolute;left:0;right:0;top:14vh;text-align:center">
      <div style="font-size:11vh;font-weight:900;font-style:italic;letter-spacing:.1em;background:linear-gradient(180deg,#fff,#ffd166 60%,#ff5a2c);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 5px 0 #2a0a05) drop-shadow(0 10px 30px rgba(0,0,0,.7));animation:stmLogo .7s cubic-bezier(.2,1.4,.4,1) both">${r.perfect ? 'PERFECT' : 'WINNER'}</div>
      <div style="font-size:4vh;font-weight:800;letter-spacing:.3em;text-shadow:0 2px 8px #000;animation:stmFade .6s .3s both">${r.winner}</div>
      <div style="display:flex;justify-content:center;gap:4vh;margin-top:2.5vh;font-size:1.8vh;letter-spacing:.2em;opacity:.85;animation:stmFade .6s .5s both">
        <span>TIME <b style="color:#ffd166">${Math.max(0, Math.round(r.time))} s</b></span><span>MAX COMBO <b style="color:#ffd166">${r.maxCombo}</b></span><span>DAMAGE <b style="color:#ffd166">${r.damage}</b></span></div>
    </div>${HELP}`);
  const poller = new MenuInputPoller();
  poller.start();
  const items: { label: string; key: ResultChoice }[] = [
    { label: 'REMATCH', key: 'rematch' },
    { label: 'CHARACTER SELECT', key: 'select' },
    { label: 'TITLE SCREEN', key: 'title' },
  ];
  const list = el(`<div style="position:absolute;left:0;right:0;top:52vh"></div>`);
  s.appendChild(list);
  list.style.left = '28vw';
  const idx = await listMenu(list, items, poller, { allowBack: false });
  poller.stop();
  s.remove();
  return items[idx].key;
}

export function typeLabel(t: SupportType): string {
  return t === 'ATTACK' ? 'ATTACK · strike back, combo join' : t === 'GUARD' ? 'GUARD · dash cut, charge guard' : 'BALANCE · cover fire';
}
