const fs = require('fs');
for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f);
  const jsonLen = b.readUInt32LE(12);
  const j = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
  console.log(f, 'bytes', b.length, 'meshes', (j.meshes||[]).length, 'nodes', (j.nodes||[]).length, 'skins', (j.skins||[]).length, 'images', (j.images||[]).length, 'materials', (j.materials||[]).length, 'animations', (j.animations||[]).length, 'anim names', (j.animations||[]).slice(0,6).map(a=>a.name), 'joints0', j.skins && j.skins[0] ? j.skins[0].joints.length : 0);
}
