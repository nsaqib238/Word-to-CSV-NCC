const fs = require('fs');

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
        } else inQuotes = false;
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

const file = process.argv[2] || 'ncc/ncc_units.csv';
const needle = process.argv[3] || 'Insert subclause NSW C4D12(10)';
const csv = fs.readFileSync(file, 'utf8');
const lines = csv.split(/\r?\n/).filter(Boolean);
const header = parseCsvLine(lines[0]);
const idx = (n) => header.indexOf(n);

const iType = idx('unit_type');
const iLabel = idx('unit_label');
const iText = idx('text');
const iRaw = idx('raw_text');
const iWarn = idx('warnings');
const iApplies = idx('applies_state');
const iVar = idx('variation_action');
const iAff = idx('affected_unit_label');
const iAffects = idx('affects_anchor_id');
const iAnchor = idx('anchor_id');

let found = 0;
for (let k = 1; k < lines.length; k++) {
  const cols = parseCsvLine(lines[k]);
  const t = cols[iText] || '';
  const rt = cols[iRaw] || '';
  if (!t.includes(needle) && !rt.includes(needle)) continue;
  found++;
  console.log({
    unit_type: cols[iType],
    unit_label: cols[iLabel],
    applies_state: cols[iApplies],
    variation_action: cols[iVar],
    affected_unit_label: cols[iAff],
    affects_anchor_id: cols[iAffects],
    anchor_id: cols[iAnchor],
    warnings: (cols[iWarn] || '').slice(0, 200),
    textPreview: t.slice(0, 140),
  });
  if (found >= 10) break;
}
console.log({ found });


