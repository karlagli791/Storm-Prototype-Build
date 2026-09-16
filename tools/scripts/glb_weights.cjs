/** glb_weights.cjs — total skin weight per joint (which bones actually deform the mesh). */
const fs = require('fs');
const f = process.argv[2];
const b = fs.readFileSync(f);
const jsonLen = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
const binOff = 20 + jsonLen + 8;
function read(accIdx) {
  const a = j.accessors[accIdx];
  const bv = j.bufferViews[a.bufferView];
  const start = binOff + (bv.byteOffset || 0) + (a.byteOffset || 0);
  const comp = { 5121: [1, 'readUInt8'], 5123: [2, 'readUInt16LE'], 5125: [4, 'readUInt32LE'], 5126: [4, 'readFloatLE'] }[a.componentType];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const stride = bv.byteStride || comp[0] * n;
  const out = [];
  for (let i = 0; i < a.count; i++) {
    const row = [];
    for (let k = 0; k < n; k++) row.push(b[comp[1]](start + i * stride + k * comp[0]));
    out.push(row);
  }
  return out;
}
const totals = new Map();
for (const m of j.meshes) {
  for (const p of m.primitives) {
    if (p.attributes.JOINTS_0 === undefined) continue;
    const J = read(p.attributes.JOINTS_0);
    const W = read(p.attributes.WEIGHTS_0);
    const skin = j.skins[0];
    for (let i = 0; i < J.length; i++) {
      for (let k = 0; k < 4; k++) {
        const w = W[i][k];
        if (w <= 0.02) continue;
        const node = skin.joints[J[i][k]];
        const name = j.nodes[node].name;
        const key = `${m.name}|${name}`;
        totals.set(key, (totals.get(key) || 0) + w);
      }
    }
  }
}
const filter = process.argv[3];
[...totals.entries()]
  .filter(([k]) => !filter || new RegExp(filter, 'i').test(k))
  .sort((a, b2) => b2[1] - a[1]).slice(0, 30)
  .forEach(([k, v]) => console.log(v.toFixed(0).padStart(7), k));
