const fs = require('fs');

function parseCsvLine(line) {
  // Minimal CSV parser for our own generated CSV: handles quotes + commas.
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
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

const file = process.argv[2] || 'ncc/ncc_units.csv';
const csv = fs.readFileSync(file, 'utf8');
const lines = csv.split(/\r?\n/).filter(Boolean);
const header = parseCsvLine(lines[0]);
const idx = (name) => header.indexOf(name);

const iUnit = idx('unit_label');
const iType = idx('unit_type');
const iText = idx('text');
const iApplies = idx('applies_state');
const iVar = idx('variation_action');

let stateRows = 0;
let nswInBase = 0;
let appliesNotBlankOnBase = 0;
let variationRows = 0;
let baseHasActionKeywords = 0;

for (let k = 1; k < lines.length; k++) {
  const cols = parseCsvLine(lines[k]);
  const type = cols[iType] || '';
  const label = cols[iUnit] || '';
  const txt = cols[iText] || '';
  const applies = cols[iApplies] || '';
  const varAct = cols[iVar] || '';

  if (type === 'STATE_VARIATION') stateRows++;
  if (type === 'STATE_VARIATION' || type === 'STATE_VARIATION_AMENDMENT') variationRows++;

  if (type !== 'STATE_VARIATION' && /\bNSW\b/i.test(txt) && !applies) {
    nswInBase++;
    if (nswInBase <= 3) {
      console.log('NSW leakage sample:', { label, type, textPreview: txt.slice(0, 140) });
    }
  }

  if (type !== 'STATE_VARIATION' && type !== 'STATE_VARIATION_AMENDMENT') {
    const s = String(txt || '').toLowerCase();
    if (/\b(delete|insert|replace)\b/.test(s) || /(does not apply|left blank|deliberately been left blank|not apply)/.test(s)) {
      baseHasActionKeywords++;
      if (baseHasActionKeywords <= 3) {
        console.log('Base row still has action keywords:', { label, type, textPreview: txt.slice(0, 160) });
      }
    }
  }

  if (type !== 'STATE_VARIATION' && applies) {
    appliesNotBlankOnBase++;
    if (appliesNotBlankOnBase <= 3) {
      console.log('Base row with applies_state set:', { label, type, applies_state: applies, variation_action: varAct });
    }
  }
}

console.log({
  rows: lines.length - 1,
  stateRows,
  variationRows,
  nswInBase,
  appliesNotBlankOnBase,
  baseHasActionKeywords,
});


