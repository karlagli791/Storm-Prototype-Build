const fs = require('fs');
const [f, idxs, outdir] = process.argv.slice(2);
const b = fs.readFileSync(f); const jsonLen = b.readUInt32LE(12); const j = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
fs.mkdirSync(outdir, { recursive: true });
for (const i of idxs.split(',').map(Number)) { const im = j.images[i]; const bv = j.bufferViews[im.bufferView]; const data = b.slice(binStart + (bv.byteOffset||0), binStart + (bv.byteOffset||0) + bv.byteLength); const p = `${outdir}/${im.name}.png`; fs.writeFileSync(p, data); console.log('wrote', p, data.length); }
