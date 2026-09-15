/**
 * soak_test.js — paste into the page console (or inject with the browser tool) on a running match
 * (`?mode=demo…` or `?mode=cpu&ai=1…`). Samples every fighter for `seconds` and reports anomalies:
 *   stuck      a reaction / hold state lasting longer than 6 s
 *   frozen     hitstop held longer than 12 s (outside cinematics)
 *   levitate   grounded state while > 0.6 m above the floor for > 1 s
 *   sink       below the floor by > 0.3 m
 *   outside    beyond the stage outline by > 1 m
 *   nan        non-finite position / velocity
 *   slide      idle / guarding while moving faster than 2 m/s for > 0.5 s
 * Returns { samples, anomalies: [{ code, kind, state, detail, t }], states } and logs a summary.
 */
window.__soak = async function soak(seconds = 30) {
  const s = window.storm;
  const REACT = new Set(['HITSTUN', 'LAUNCHED', 'TUMBLE', 'CRUMPLE', 'KNOCKDOWN', 'WALL_SPLAT', 'BLOCKSTUN', 'GUARD_BREAK', 'SUBSTITUTED', 'DODGE', 'DASH_IMPACT', 'THROW']);
  const GROUNDED = new Set(['IDLE_NEUTRAL', 'RUNNING', 'GUARDING', 'KNOCKDOWN', 'CHAKRA_CHARGE', 'BLOCKSTUN']);
  const STILL = new Set(['IDLE_NEUTRAL', 'GUARDING', 'CHAKRA_CHARGE']);
  const track = new Map();
  const anomalies = [];
  const states = {};
  const t0 = performance.now();
  let samples = 0;
  const flag = (f, kind, detail) => {
    const key = f.id + kind;
    const tr = track.get(key) ?? { last: -1e9 };
    const now = performance.now();
    if (now - tr.last < 3000) return;
    tr.last = now;
    track.set(key, tr);
    anomalies.push({ code: f.def.code, kind, state: f.state, detail, t: +((now - t0) / 1000).toFixed(1) });
  };
  const timers = new Map();
  const timer = (f, name, on, dt) => {
    const k = f.id + name;
    const v = on ? (timers.get(k) ?? 0) + dt : 0;
    timers.set(k, v);
    return v;
  };
  let prev = performance.now();
  while (performance.now() - t0 < seconds * 1000) {
    await new Promise((r) => setTimeout(r, 100));
    const now = performance.now();
    const dt = (now - prev) / 1000;
    prev = now;
    samples++;
    for (const team of [s.team1, s.team2]) {
      for (const f of team.present) {
        states[f.state] = (states[f.state] ?? 0) + 1;
        const p = f.position, v = f.velocity;
        if (![p.x, p.y, p.z, v.x, v.y, v.z].every(Number.isFinite)) flag(f, 'nan', `${p.x},${p.y},${p.z}`);
        const lift = p.y - f.groundY;
        if (timer(f, 'lev', GROUNDED.has(f.state) && lift > 0.6, dt) > 1) flag(f, 'levitate', `+${lift.toFixed(2)} m`);
        if (lift < -0.3) flag(f, 'sink', `${lift.toFixed(2)} m`);
        const lim = s.arena.limitAt ? s.arena.limitAt(Math.atan2(p.z, p.x)) : s.arena.radius;
        const r = Math.hypot(p.x, p.z);
        if (r > lim + 1) flag(f, 'outside', `r ${r.toFixed(1)} > ${lim.toFixed(1)}`);
        if (timer(f, 'stuck', REACT.has(f.state) && !f.heldBy, dt) > 6) flag(f, 'stuck', `${f.state} for ${timer(f, 'stuck', true, 0).toFixed(1)} s`);
        if (timer(f, 'frozen', f.hitstopFrames > 0 && !f.heldBy, dt) > 12) flag(f, 'frozen', `hitstop ${f.hitstopFrames}`);
        const sp = Math.hypot(v.x, v.z);
        if (timer(f, 'slide', STILL.has(f.state) && sp > 2, dt) > 0.5) flag(f, 'slide', `${sp.toFixed(1)} m/s in ${f.state}`);
      }
    }
  }
  const out = { samples, anomalies, states, winner: s.winner, hp: [Math.round(s.team1.stats.health), Math.round(s.team2.stats.health)] };
  console.log('[soak]', JSON.stringify(out));
  return out;
};
