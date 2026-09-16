/** glb_rest.cjs — print rest-pose world positions of the OP_* canonical bones in a GLB.
 *  Used to author the procedural OPBR poses (arm span, A/T pose, facing axis). */
const fs = require('fs');
function mul(a, b) { // 4x4 column-major multiply (a*b)
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}
function trs(n) {
  if (n.matrix) return n.matrix;
  const t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  const [x, y, z, w] = r;
  const m = [
    (1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + z * w)) * s[0], (2 * (x * z - y * w)) * s[0], 0,
    (2 * (x * y - z * w)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + x * w)) * s[1], 0,
    (2 * (x * z + y * w)) * s[2], (2 * (y * z - x * w)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
  return m;
}
for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f);
  const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString('utf8'));
  const world = new Map();
  const walk = (i, parent) => {
    const n = j.nodes[i];
    const m = mul(parent, trs(n));
    world.set(i, m);
    for (const c of n.children || []) walk(c, m);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of j.scenes[0].nodes) walk(r, I);
  const out = {};
  j.nodes.forEach((n, i) => { if (n.name && n.name.startsWith('OP_')) { const m = world.get(i); out[n.name] = [m[12], m[13], m[14]].map((v) => +v.toFixed(3)); } });
  console.log('##', f.split(/[\\/]/).pop());
  for (const k of Object.keys(out).sort()) console.log('  ', k.padEnd(14), out[k].join(', '));
}
