const fs = require('fs');
const path = require('path');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const file = process.argv[2] || path.join('ncc', 'ncc_units.csv');
if (!fs.existsSync(file)) {
  console.error('CSV not found:', file);
  process.exit(1);
}

const csv = fs.readFileSync(file, 'utf8');
const lines = csv.split(/\r?\n/).filter(Boolean);
const header = parseCsvLine(lines[0]);
const idx = (n) => header.indexOf(n);

const iText = idx('text');
const iLabel = idx('unit_label');
const iType = idx('unit_type');

const stateRe = /\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\s+[A-Z]\d+[A-Z]\d+(\(\d+\))?\b/;
const modRe = /\b(delete|insert|replace)\b|does not apply|not apply|left blank|deliberately been left blank/i;

let shown = 0;
for (let k = 1; k < lines.length; k++) {
  const cols = parseCsvLine(lines[k]);
  const t = cols[iText] || '';
  if (!stateRe.test(t)) continue;
  if (!modRe.test(t)) continue;
  const s = t.toLowerCase();
  if (s.includes('refer to') && !/\b(delete|insert|replace)\b|does not apply|left blank/.test(s)) continue;
  console.log({ unit_label: cols[iLabel] || '', unit_type: cols[iType] || '', preview: t.slice(0, 220) });
  shown++;
  if (shown >= 15) break;
}
console.log('shown', shown);


