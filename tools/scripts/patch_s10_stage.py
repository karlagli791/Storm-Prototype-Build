"""Session 10 stages: the walkable outline comes from the stage's own floor geometry (72 rays marched
outward until the floor ends or steps like a wall / cliff), movement is limited to that outline, and
ground height is the highest surface at or below the fighter's feet (no snapping onto roofs, decks
or canopies — the levitation bug)."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = os.path.join(root, 'src', 'systems', 'ArenaEnvironment.ts')
s = open(p, encoding='utf-8').read()
if 'computeBounds' in s:
    print('already'); raise SystemExit
def rep(old, new, count=1):
    global s
    assert old in s, old[:120]; s = s.replace(old, new, count)

rep("  private heightCache = new Map<number, number>();", """  /** Cached floor hits per 0.5 m cell: every surface height under the cell, highest first. */
  private heightCache = new Map<number, number[]>();
  /** Walkable outline: max distance from the arena centre per angle (72 samples), null = circle. */
  private limits: Float32Array | null = null;""")

a = s.index("  groundY(x: number, z: number): number {")
b = s.index("  async tryLoadStage(", a)
s = s[:a] + """  /** Every floor surface height under (x, z), highest first (cached on a 0.5 m grid). */
  private sampleCell(x: number, z: number): number[] {
    const gx = Math.round(x * 2), gz = Math.round(z * 2);
    const key = (gx + 4096) * 8192 + (gz + 4096);
    let ys = this.heightCache.get(key);
    if (ys) return ys;
    this.heightRay.ray.origin.set(gx * 0.5, 120, gz * 0.5);
    const res = this.heightRay.intersectObjects(this.floorMeshes, false);
    ys = res.map((r) => r.point.y);
    this.heightCache.set(key, ys);
    return ys;
  }

  /**
   * Floor height under (x, z). With `refY` (the fighter's current height) the result is the highest
   * surface at or below the feet plus a small step — fighters stand on the ground they are on instead
   * of popping up onto a roof, bridge deck or canopy above them. Without it: the first surface under
   * +4 m (legacy behaviour for effects).
   */
  groundY(x: number, z: number, refY?: number): number {
    if (!this.floorMeshes.length) return 0;
    const ys = this.sampleCell(x, z);
    if (!ys.length) return 0;
    if (refY === undefined) {
      for (const y of ys) if (y <= 4.0) return y;
      return ys[ys.length - 1];
    }
    for (const y of ys) if (y <= refY + 0.6) return y;
    return ys[ys.length - 1];
  }

  /**
   * Walkable outline of the loaded stage: march outward along 72 rays over the floor meshes and stop
   * where the floor ends or jumps by more than a ledge (wall, cliff, building). Movement is limited to
   * this outline, so fighters stay inside the area the stage was authored for.
   */
  private computeBounds(): void {
    if (!this.floorMeshes.length) { this.limits = null; return; }
    const N = 72, step = 1.5, maxR = 72;
    const lim = new Float32Array(N);
    const y0 = this.groundY(0, 0, 1);
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const cx = Math.cos(ang), cz = Math.sin(ang);
      let prev = y0, last = 0;
      for (let r = step; r <= maxR; r += step) {
        const ys = this.sampleCell(cx * r, cz * r);
        if (!ys.length) break;
        let best = ys[0], bd = Math.abs(ys[0] - prev);
        for (const y of ys) { const d = Math.abs(y - prev); if (d < bd) { bd = d; best = y; } }
        if (bd > 1.6) break;
        prev = best;
        last = r;
      }
      lim[i] = Math.max(9, last - 1.0);
    }
    // A single long spike (a corridor between walls) does not open the arena up.
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) out[i] = Math.min(lim[i], (lim[(i + N - 1) % N] + lim[(i + 1) % N]) * 0.5 + 4);
    this.limits = out;
    let mx = 0;
    for (const v of out) mx = Math.max(mx, v);
    this.radius = Math.min(75, Math.max(ARENA_RADIUS, mx));
  }

  /** Allowed distance from the centre in a direction (angle = atan2(z, x)). */
  limitAt(angle: number): number {
    const L = this.limits;
    if (!L) return this.radius;
    const N = L.length;
    let f = (angle / (Math.PI * 2)) * N;
    f = ((f % N) + N) % N;
    const i = Math.floor(f), t = f - i;
    return L[i] * (1 - t) + L[(i + 1) % N] * t;
  }

""" + s[b:]

rep("      this.stageRoot = scene;\n", "      this.computeBounds();\n      this.stageRoot = scene;\n")
rep("    this.radius = ARENA_RADIUS;\n", "    this.radius = ARENA_RADIUS;\n    this.limits = null;\n")
rep("""    const limit = this.radius - colliderRadius;
    const rxz = Math.hypot(pos.x, pos.z);""", """    const limit = this.limitAt(Math.atan2(pos.z, pos.x)) - colliderRadius;
    const rxz = Math.hypot(pos.x, pos.z);""")
rep("""      if (vn < 0) {
        vel.addScaledVector(n, -vn); // v_tangent = v - (v.n) n
      }""", """      if (vn < 0) {
        vel.addScaledVector(n, -vn); // v_tangent = v - (v.n) n
      }
      // Walking / jumping into the edge stops you there instead of sliding along it.
      if (!isKnockback) { vel.x *= 0.35; vel.z *= 0.35; }""")
open(p, 'w', encoding='utf-8').write(s)
print('stage ok')
