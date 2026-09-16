"""Session 11: HUD support for the One Piece fighters — skill palette with cooldowns, the
character's own gauge name (HAKI / ROOM / GRAVITY …) and a Haki-coat marker. Idempotent."""
import io, os

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def edit(rel, fn):
    p = os.path.join(root, rel)
    s = io.open(p, encoding='utf-8').read()
    out = fn(s)
    if out is None:
        print(f'   {rel}: already patched')
        return
    io.open(p, 'w', encoding='utf-8').write(out)
    print(f'   {rel}: patched')


def hud(s):
    if 'skills?:' in s:
        return None
    s = s.replace("""  /** PL_ACT_* name of the current state (debug readout). */
  act: string;
}""", """  /** PL_ACT_* name of the current state (debug readout). */
  act: string;
  /** One Piece fighters: the four palette skills with their cooldowns, and the gauge's own name. */
  skills?: { name: string; button: string; cooldown: number; max: number; cost: number; ready: boolean }[];
  gaugeName?: string;
  haki?: boolean;
}""")
    # draw the palette under the name plate
    s = s.replace("""    // Guard durability mini bar""", """    // One Piece skill palette: four slots with their cooldown sweep (L1 + face buttons).
    if (f.skills?.length) {
      const sw = 34;
      const sh = 16;
      const sy = pipsY + 12;
      for (let i = 0; i < f.skills.length; i++) {
        const sk = f.skills[i];
        const sx = mirror ? barX + bw - 8 - (i + 1) * (sw + 5) : barX + 8 + i * (sw + 5);
        ctx.fillStyle = sk.ready ? 'rgba(20,28,44,0.85)' : 'rgba(30,14,14,0.85)';
        ctx.fillRect(sx, sy, sw, sh);
        if (sk.cooldown > 0 && sk.max > 0) {
          ctx.fillStyle = 'rgba(255,70,70,0.35)';
          ctx.fillRect(sx, sy, sw * (sk.cooldown / sk.max), sh);
        }
        ctx.strokeStyle = sk.ready ? 'rgba(180,220,255,0.75)' : 'rgba(255,140,140,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
        ctx.fillStyle = sk.ready ? '#dff0ff' : '#ffb0b0';
        ctx.font = '600 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(sk.button, sx + sw / 2, sy + 11);
      }
      ctx.textAlign = 'left';
      if (f.haki) {
        ctx.fillStyle = '#c8a8ff';
        ctx.font = '700 11px "Segoe UI", sans-serif';
        const hx = mirror ? barX + bw - 8 - 4 * (sw + 5) - 44 : barX + 8 + 4 * (sw + 5) + 4;
        ctx.fillText('HAKI', hx, sy + 12);
      }
    }

    // Guard durability mini bar""")
    return s


def main_ts(s):
    if 'gaugeName:' in s:
        return None
    return s.replace("""      ultimateReady: s.chakra >= 90,""", """      ultimateReady: s.chakra >= 90,
      gaugeName: f.def.opbr?.gaugeName,
      haki: f.hakiFrames > 0,
      skills: f.def.opbr
        ? [...f.def.opbr.skills.map((sk, i) => ({
            name: sk.name,
            button: ['L1+O', 'L1+/\\\\', 'L1+[]', 'L1+X'][i] ?? `S${i + 1}`,
            cooldown: f.skillCooldowns[i],
            max: sk.cooldown,
            cost: sk.cost,
            ready: f.skillCooldowns[i] <= 0 && s.chakra >= sk.cost,
          })), {
            name: f.def.opbr.ultimate.name,
            button: 'R1+O',
            cooldown: 0,
            max: 0,
            cost: f.def.opbr.ultimate.cost,
            ready: s.chakra >= f.def.opbr.ultimate.cost,
          }]
        : undefined,""")


print('patching:')
edit('src/ui/UIOverlay.ts', hud)
edit('src/main.ts', main_ts)
