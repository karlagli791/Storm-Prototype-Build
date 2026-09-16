/** glb_chain.cjs — print the parent chain of each OP_* bone (verifies the canonical mapping). */
const fs = require('fs');
for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f);
  const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString('utf8'));
  const parent = new Array(j.nodes.length).fill(-1);
  j.nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));
  const nm = (i) => j.nodes[i].name || `#${i}`;
  console.log('##', f.split(/[\/]/).pop());
  for (const key of ['OP_L_Arm', 'OP_L_Fore', 'OP_L_Hand', 'OP_L_Thigh', 'OP_L_Calf', 'OP_L_Foot', 'OP_Weapon']) {
    const i = j.nodes.findIndex((n) => n.name === key);
    if (i < 0) { console.log('  ', key.padEnd(11), '(absent)'); continue; }
    const out = [];
    for (let k = i; k >= 0; k = parent[k]) out.push(nm(k));
    console.log('  ', key.padEnd(11), out.slice(0, 4).join(' < '));
  }
}
