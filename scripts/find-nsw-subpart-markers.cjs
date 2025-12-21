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
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
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
const csv = fs.readFileSync(file, 'utf8');
const lines = csv.split(/\r?\n/).filter(Boolean);
const header = parseCsvLine(lines[0]);
const iText = header.indexOf('text');
const iWarn = header.indexOf('warnings');

const re = /\bNSW\s+([A-Z]\d+[A-Z]\d+)\((\d+)\)\b/g;
let rowsWithMarkers = 0;
let totalMarkers = 0;

for (let k = 1; k < lines.length; k++) {
  const cols = parseCsvLine(lines[k]);
  const w = cols[iWarn] || '';
  if (!w.includes('STATE_VARIATION_EMBEDDED')) continue;
  const t = cols[iText] || '';
  let m;
  let rowCounted = false;
  while ((m = re.exec(t)) !== null) {
    totalMarkers++;
    if (!rowCounted) {
      rowsWithMarkers++;
      rowCounted = true;
      if (rowsWithMarkers <= 3) {
        console.log('Sample row text preview:', t.slice(0, 220));
      }
    }
  }
}

console.log({ rowsWithMarkers, totalMarkers });


