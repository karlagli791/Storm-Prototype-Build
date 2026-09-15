/**
 * UIOverlay.ts — 2D canvas HUD: health bars, chakra meters (with max-cap penalty region),
 * 4 substitution pips with recharge arc, support/storm gauge, guard durability, combo counter,
 * state debug readout and an event ticker.
 */
import { CombatState, GUARD_HEALTH_MAX, SUB_RECHARGE_SECONDS, SUB_STOCK_MAX } from '../core/Types';

export interface HudFighterData {
  name: string;
  code: string;
  color: string;
  health: number;
  healthMax: number;
  chakra: number;
  chakraMax: number;
  penaltyActive: boolean;
  subStocks: number;
  subProgress: number;
  guardHealth: number;
  supportGauge: number;
  state: CombatState;
  stateFrame: number;
  comboHits: number;
  comboDamage: number;
  isLeader: boolean;
  partnerName: string;
  /** Storm 2 face_le portrait paths (leader / support). */
  portrait: string | null;
  supportPortrait: string | null;
  supportType: 'ATTACK' | 'GUARD' | 'BALANCE';
  /** Support gauge at or above the call cost. */
  supportReady: boolean;
  /** PL_ACT_* name of the current state (debug readout). */
  act: string;
}

/** Small image cache for HUD portraits. */
const portraitCache = new Map<string, HTMLImageElement>();
function portrait(path: string | null): HTMLImageElement | null {
  if (!path) return null;
  let im = portraitCache.get(path);
  if (!im) {
    im = new Image();
    im.src = path;
    portraitCache.set(path, im);
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}

export interface HudData {
  p1: HudFighterData;
  p2: HudFighterData;
  roundTime: number;
  fps: number;
  tick: number;
  debug: boolean;
  events: string[];
  winner: string | null;
  paused: boolean;
  /** Human-readable controller label, or null when only the keyboard is active. */
  controller: string | null;
  /** Storm 2 banner to show: round-start "Go!", "Time Up", or the result. */
  banner: 'go' | 'timeup' | 'draw' | null;
  /** Which side won (1 or 2) once `winner` is set; drives the 1P/2P + Won/Defeated sprites. */
  winnerSide: 1 | 2 | 0;
}

interface SpriteDef {
  img: string;
  rect: [number, number, number, number];
}

/** Sprite atlas cut from the Storm 2 duel UI textures (public/assets/ui, rects in sprites.json). */
class StormSprites {
  private images = new Map<string, HTMLImageElement>();
  private defs: Record<string, SpriteDef> = {};
  ready = false;

  constructor(base = 'assets/ui/') {
    fetch(base + 'sprites.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: Record<string, SpriteDef>) => {
        this.defs = json;
        const files = new Set(Object.values(json).map((d) => d.img));
        let pending = files.size;
        for (const f of files) {
          const im = new Image();
          im.onload = () => {
            if (--pending === 0) this.ready = true;
          };
          im.onerror = () => {
            if (--pending === 0) this.ready = true;
          };
          im.src = base + f;
          this.images.set(f, im);
        }
      })
      .catch(() => {
        this.ready = false;
      });
  }

  has(name: string): boolean {
    const d = this.defs[name];
    return !!d && this.ready && !!this.images.get(d.img)?.complete && (this.images.get(d.img)?.naturalWidth ?? 0) > 0;
  }

  /** Draw a sprite scaled to `height` px, anchored by its center-x / center-y. */
  draw(ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number, height: number, alpha = 1): number {
    const d = this.defs[name];
    const im = d ? this.images.get(d.img) : undefined;
    if (!d || !im || !im.complete || im.naturalWidth === 0) return 0;
    const [sx, sy, sw, sh] = d.rect;
    const s = height / sh;
    const w = sw * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, sx, sy, sw, sh, cx - w / 2, cy - height / 2, w, height);
    ctx.restore();
    return w;
  }

  width(name: string, height: number): number {
    const d = this.defs[name];
    if (!d) return 0;
    return (d.rect[2] * height) / d.rect[3];
  }
}

export class UIOverlay {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private lagHealth = { p1: 1, p2: 1 };
  private toast: { text: string; t: number; color: string } | null = null;
  private sprites = new StormSprites();
  private bannerTime = 0;
  private lastBanner: string | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  showToast(text: string, color = '#ffffff', seconds = 1.2): void {
    this.toast = { text, t: seconds, color };
  }

  draw(data: HudData, dt: number): void {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    ctx.clearRect(0, 0, w, h);

    const barW = Math.min(520, w * 0.38);
    const pad = 28;

    this.drawFighterPanel(data.p1, pad, 22, barW, false, 'p1', dt);
    this.drawFighterPanel(data.p2, w - pad - barW, 22, barW, true, 'p2', dt);

    // Round timer: Storm 2 brush digits when the sprite atlas is loaded, text otherwise.
    const t = Math.max(0, Math.ceil(data.roundTime));
    const digits = String(t).padStart(2, '0');
    if (this.sprites.has('count_0')) {
      const dh = 46;
      const widths = [...digits].map((c) => this.sprites.width(`count_${c}`, dh));
      const total = widths.reduce((a, b) => a + b, 0) + 4;
      let x = w / 2 - total / 2;
      for (let i = 0; i < digits.length; i++) {
        this.sprites.draw(ctx, `count_${digits[i]}`, x + widths[i] / 2, 44, dh);
        x += widths[i] + 4;
      }
    } else {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 8;
      ctx.fillText(digits, w / 2, 56);
      ctx.restore();
    }
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;
    ctx.fillText('STORM PROTOTYPE ENGINE', w / 2, 80);
    ctx.restore();

    // Storm 2 banners ("Go!", "Time Up") with a short pop-in.
    if (data.banner !== this.lastBanner) {
      this.lastBanner = data.banner;
      this.bannerTime = 0;
    }
    if (data.banner && this.sprites.has(`banner_${data.banner}`)) {
      this.bannerTime += dt;
      const pop = Math.min(1, this.bannerTime / 0.18);
      const scale = 1.35 - 0.35 * pop;
      const fade = data.banner === 'go' ? Math.max(0, Math.min(1, (1.6 - this.bannerTime) / 0.3)) : 1;
      if (fade > 0) this.sprites.draw(ctx, `banner_${data.banner}`, w / 2, h * 0.36, 150 * scale, fade);
    }

    // Combo counters
    this.drawCombo(data.p1, pad + 6, 215, false);
    this.drawCombo(data.p2, w - pad - 6, 215, true);

    // Debug readout
    if (data.debug) this.drawDebug(data);

    // Event ticker (bottom-left)
    this.drawEvents(data.events);

    // Controls hint (bottom-right) + controller indicator
    this.drawControls(data.controller);
    this.drawControllerBadge(data.controller);

    // Toast
    if (this.toast) {
      this.toast.t -= dt;
      const a = Math.min(1, this.toast.t / 0.3);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = 'center';
      ctx.font = 'bold 46px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = this.toast.color;
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 14;
      ctx.fillText(this.toast.text, w / 2, h * 0.34);
      ctx.restore();
      if (this.toast.t <= 0) this.toast = null;
    }

    if (data.winner) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, h * 0.4, w, 120);
      if (data.winnerSide && this.sprites.has('banner_won') && this.sprites.has('tag_p1')) {
        // Storm 2 result plates: "1P Won" / "2P Defeated" (from the loser's side).
        const tagW = this.sprites.width(`tag_p${data.winnerSide}`, 64);
        const wonW = this.sprites.width('banner_won', 64);
        const total = tagW + 18 + wonW;
        this.sprites.draw(ctx, `tag_p${data.winnerSide}`, w / 2 - total / 2 + tagW / 2, h * 0.4 + 52, 64);
        this.sprites.draw(ctx, 'banner_won', w / 2 - total / 2 + tagW + 18 + wonW / 2, h * 0.4 + 52, 64);
      } else {
        ctx.textAlign = 'center';
        ctx.font = 'bold 56px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(`${data.winner} WINS`, w / 2, h * 0.4 + 70);
      }
      ctx.textAlign = 'center';
      ctx.font = '18px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${data.winner}  —  press R / Create to rematch`, w / 2, h * 0.4 + 104);
      ctx.restore();
    }
    if (data.paused && !data.winner) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 40px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 10;
      ctx.fillText('PAUSED', w / 2, h / 2);
      ctx.restore();
    }
  }

  private drawFighterPanel(f: HudFighterData, x: number, y: number, barW: number, mirror: boolean, key: 'p1' | 'p2', dt: number): void {
    const ctx = this.ctx;
    const dir = mirror ? -1 : 1;
    // Storm 2 duel gauge layout: portrait medallion at the outer edge, name plate + bars toward the centre.
    const pr = 44; // portrait radius
    const px = mirror ? x + barW - pr - 4 : x + pr + 4;
    const py = y + 46;
    const barX = mirror ? x : x + pr * 2 + 18;
    const bw = barW - pr * 2 - 18;

    // Portrait medallion
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, pr + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#2b1d12';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = f.color;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.clip();
    const im = portrait(f.portrait);
    if (im) ctx.drawImage(im, px - pr, py - pr, pr * 2, pr * 2);
    else {
      ctx.fillStyle = f.color;
      ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    ctx.restore();

    // Name plate
    ctx.save();
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = mirror ? 'right' : 'left';
    ctx.fillStyle = '#fff3d6';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6;
    ctx.fillText(f.name, mirror ? barX + bw : barX, y + 18);
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(f.code.toUpperCase() + '  ' + f.act.replace('PL_ACT_', ''), mirror ? barX + bw : barX, y + 32);
    ctx.restore();

    // Life bar (green, Storm style) with lag bar
    const hy = y + 40;
    const hh = 14;
    const hp = Math.max(0, f.health / f.healthMax);
    const lag = this.lagHealth[key];
    this.lagHealth[key] = lag > hp ? Math.max(hp, lag - dt * 0.35) : hp;
    this.skewBar(barX, hy, bw, hh, 1, '#14100c', dir);
    this.skewBar(barX, hy, bw, hh, this.lagHealth[key], '#b2352e', dir);
    this.skewBar(barX, hy, bw, hh, hp, hp > 0.35 ? '#3fd08a' : '#ffb03f', dir);
    this.skewOutline(barX, hy, bw, hh, dir, 'rgba(255,230,190,0.8)');

    // Chakra bar (blue) directly beneath, shorter, with the penalty cap shaded
    const cy = hy + hh + 4;
    const ch = 7;
    const cw = bw * 0.78;
    const cx = mirror ? barX + bw - cw : barX;
    this.skewBar(cx, cy, cw, ch, 1, '#0b1626', dir);
    if (f.penaltyActive) this.skewBar(cx, cy, cw, ch, 1, 'rgba(255,60,60,0.35)', dir);
    this.skewBar(cx, cy, cw, ch, f.chakraMax / 100, '#123a63', dir);
    this.skewBar(cx, cy, cw, ch, f.chakra / 100, '#4fc3ff', dir);
    this.skewOutline(cx, cy, cw, ch, dir, 'rgba(160,220,255,0.7)');

    // Support medallion under the portrait (Storm 2 shows the support faces with LB/RB tags)
    const sr = 22;
    const sx = mirror ? px + 6 : px - 6;
    const sy = py + pr + sr + 6;
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, sr + 3, 0, Math.PI * 2);
    ctx.fillStyle = f.supportReady ? '#8a4dff' : '#2a2438';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.clip();
    const sim = portrait(f.supportPortrait);
    if (sim) ctx.drawImage(sim, sx - sr, sy - sr, sr * 2, sr * 2);
    else {
      ctx.fillStyle = '#555';
      ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    if (!f.supportReady) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    ctx.restore();
    ctx.save();
    ctx.font = 'bold 10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#111';
    ctx.fillRect(sx - 16, sy + sr - 2, 32, 13);
    ctx.fillStyle = '#fff';
    ctx.fillText(mirror ? 'AI' : 'R1', sx, sy + sr + 8);
    ctx.font = '9px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = mirror ? 'right' : 'left';
    ctx.fillText(`${f.partnerName} · ${f.supportType}`, mirror ? sx - sr - 6 : sx + sr + 6, sy + 4);
    ctx.restore();

    // Support gauge (thin, purple) under the chakra bar
    const gy = cy + ch + 5;
    const gw = bw * 0.55;
    const gx = mirror ? barX + bw - gw : barX;
    this.skewBar(gx, gy, gw, 5, 1, '#1f1533', dir);
    this.skewBar(gx, gy, gw, 5, f.supportGauge / 100, f.supportGauge >= 50 ? '#c084fc' : '#7c3aed', dir);
    this.skewOutline(gx, gy, gw, 5, dir, 'rgba(200,160,255,0.6)');

    // Substitution pips (blueprint mechanic) next to the support gauge
    const pipR = 6;
    const pipsY = gy + 14;
    for (let i = 0; i < SUB_STOCK_MAX; i++) {
      const ppx = mirror ? barX + bw - 8 - i * (pipR * 2 + 6) : barX + 8 + i * (pipR * 2 + 6);
      const filled = i < f.subStocks;
      ctx.beginPath();
      ctx.arc(ppx, pipsY, pipR, 0, Math.PI * 2);
      ctx.fillStyle = filled ? '#f5f5f5' : 'rgba(255,255,255,0.15)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.stroke();
      if (!filled && i === f.subStocks) {
        const frac = f.subProgress / SUB_RECHARGE_SECONDS;
        ctx.beginPath();
        ctx.arc(ppx, pipsY, pipR - 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // Guard durability mini bar
    const gdw = bw * 0.3;
    const gdx = mirror ? barX + bw - 8 - SUB_STOCK_MAX * (pipR * 2 + 6) - gdw - 6 : barX + 8 + SUB_STOCK_MAX * (pipR * 2 + 6) + 6;
    const gf = f.guardHealth / GUARD_HEALTH_MAX;
    const gc = gf > 0.6 ? '#3fa9ff' : gf > 0.3 ? '#ffd23f' : '#ff3f3f';
    this.skewBar(gdx, pipsY - 2, gdw, 4, 1, '#111', dir);
    this.skewBar(gdx, pipsY - 2, gdw, 4, gf, gc, dir);
  }

  private skewBar(x: number, y: number, w: number, h: number, frac: number, color: string, dir: number): void {
    const ctx = this.ctx;
    const skew = 6;
    const fw = w * Math.max(0, Math.min(1, frac));
    ctx.beginPath();
    if (dir > 0) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + fw + skew, y);
      ctx.lineTo(x + fw, y + h);
      ctx.lineTo(x - skew, y + h);
    } else {
      const r = x + w;
      ctx.moveTo(r, y);
      ctx.lineTo(r - fw - skew, y);
      ctx.lineTo(r - fw, y + h);
      ctx.lineTo(r + skew, y + h);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  private skewOutline(x: number, y: number, w: number, h: number, dir: number, color: string): void {
    const ctx = this.ctx;
    const skew = 6;
    ctx.beginPath();
    if (dir > 0) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w + skew, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x - skew, y + h);
    } else {
      const r = x + w;
      ctx.moveTo(r, y);
      ctx.lineTo(r - w - skew, y);
      ctx.lineTo(r - w, y + h);
      ctx.lineTo(r + skew, y + h);
    }
    ctx.closePath();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  private drawCombo(f: HudFighterData, x: number, y: number, mirror: boolean): void {
    if (f.comboHits < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = mirror ? 'right' : 'left';
    ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#ffd23f';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText(`${f.comboHits} HITS`, x, y);
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${f.comboDamage} DMG`, x, y + 20);
    ctx.restore();
  }

  private drawDebug(d: HudData): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '12px Consolas, monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(this.w / 2 - 230, 88, 460, 62);
    ctx.fillStyle = '#9be7ff';
    ctx.textAlign = 'left';
    ctx.fillText(`P1 ${d.p1.state} f${d.p1.stateFrame}`, this.w / 2 - 220, 106);
    ctx.fillText(`P2 ${d.p2.state} f${d.p2.stateFrame}`, this.w / 2 - 220, 124);
    ctx.fillStyle = '#fff';
    ctx.fillText(`tick ${d.tick}  fps ${d.fps.toFixed(0)}  [F3 hitboxes]`, this.w / 2 - 220, 142);
    ctx.restore();
  }

  private drawEvents(events: string[]): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '12px Consolas, monospace';
    ctx.textAlign = 'left';
    const n = Math.min(events.length, 7);
    for (let i = 0; i < n; i++) {
      const e = events[events.length - 1 - i];
      ctx.globalAlpha = 1 - i * 0.12;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      const y = this.h - 120 - i * 16;
      ctx.fillRect(20, y - 12, ctx.measureText(e).width + 12, 15);
      ctx.fillStyle = '#e8f4ff';
      ctx.fillText(e, 26, y);
    }
    ctx.restore();
  }

  private drawControllerBadge(controller: string | null): void {
    const ctx = this.ctx;
    const text = controller ? `●  ${controller}` : '○  No controller detected — press any button on the pad';
    ctx.save();
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    const w = ctx.measureText(text).width + 16;
    const x = 20;
    const y = this.h - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x - 8, y - 14, w, 20);
    ctx.fillStyle = controller ? '#43d17a' : 'rgba(255,255,255,0.55)';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private drawControls(controller: string | null): void {
    const ctx = this.ctx;
    const lines = controller
      ? [
          'L-stick move   ✕ jump / ninja move   ○ attack (stick or D-pad up/down + ○ = up/down branch)',
          '△ hold = chakra charge   △ + ✕ / R2 = chakra dash (hold = charged, in a combo = spark)   □ shuriken',
          'L2 guard   L2 + ○ guard break counter   L2 in hitstun = substitution   △ + ○ jutsu   L1 / R1 support   R3 switch',
          'Options pause   Create rematch   ESC character select',
        ]
      : [
          'WASD move   SPACE jump/ninja move   J attack (W/S + J = up/down branch)',
          'K chakra dash (hold = charged, in a combo = spark)   N chakra charge   H shuriken   L guard   L+J guard break counter',
          'I substitution (in hitstun)   U jutsu   Y support   O leader switch   F3 hitboxes   F4 AI   F5 stage   R rematch   P pause   ESC select',
        ];
    ctx.save();
    ctx.font = '11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], this.w - 20, this.h - 20 - (lines.length - 1 - i) * 15);
    }
    ctx.restore();
  }
}
