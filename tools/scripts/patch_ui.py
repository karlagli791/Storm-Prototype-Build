"""Replace the HUD fighter panel with the Storm 2 layout (leader portrait circle, name plate,
life + chakra bars, support portrait with call label, sub pips, guard durability)."""
p = r'C:\Users\ysoyo\OneDrive\Desktop\wan\storm4-proto\src\ui\UIOverlay.ts'
s = open(p, encoding='utf-8').read()
start = s.index("  private drawFighterPanel(")
end = s.index("  private skewBar(")
new = r'''  private drawFighterPanel(f: HudFighterData, x: number, y: number, barW: number, mirror: boolean, key: 'p1' | 'p2', dt: number): void {
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

'''
s = s[:start] + new + s[end:]
open(p, 'w', encoding='utf-8').write(s)
print('ui patched')
