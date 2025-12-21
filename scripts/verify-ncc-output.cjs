const fs = require('fs');
const csv = fs.readFileSync(process.argv[2] || 'ncc/ncc_units.csv', 'utf8');
const lines = csv.split(/\r?\n/).filter(Boolean);
const header = lines[0].split(',');

const parseLine = (line) => {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          q = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') q = true;
      else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
  }
  out.push(cur);
  return out;
};

const iLabel = header.indexOf('unit_label');
const iType = header.indexOf('unit_type');
const iText = header.indexOf('text');
const iBaseLabel = header.indexOf('base_unit_label');
const iTableGrid = header.indexOf('table_grid_json');
const iNotesQuality = header.indexOf('notes_quality');

console.log('=== VERIFICATION REPORT ===\n');

// Check S3C1-S3C6
console.log('FINDING 1: S3C1-S3C6 text check:');
let s3Count = 0;
let s3WithText = 0;
for (let k = 1; k < lines.length; k++) {
  const cols = parseLine(lines[k]);
  const label = cols[iLabel] || '';
  const type = cols[iType] || '';
  const text = cols[iText] || '';
  if (/^S3C[1-6]$/.test(label) && type === 'SPECIFICATION_CLAUSE') {
    s3Count++;
    if (text.trim().length > 0) {
      s3WithText++;
      console.log(`  ✓ ${label}: text length ${text.length}`);
    } else {
      console.log(`  ✗ ${label}: EMPTY TEXT`);
    }
  }
}
console.log(`  Result: ${s3WithText}/${s3Count} have text\n`);

// Check STATE_VARIATION base_unit_label
console.log('FINDING 3: STATE_VARIATION base_unit_label check:');
let svCount = 0;
let svWithBase = 0;
for (let k = 1; k < lines.length; k++) {
  const cols = parseLine(lines[k]);
  const type = cols[iType] || '';
  const baseLabel = cols[iBaseLabel] || '';
  if (type === 'STATE_VARIATION') {
    svCount++;
    if (baseLabel.trim().length > 0) {
      svWithBase++;
    } else {
      const label = cols[iLabel] || '';
      console.log(`  ✗ Missing base_unit_label: ${label}`);
    }
  }
}
console.log(`  Result: ${svWithBase}/${svCount} have base_unit_label\n`);

// Check tables
console.log('FINDING 2: TABLE rows with table_grid_json:');
let tableCount = 0;
let tableWithGrid = 0;
for (let k = 1; k < lines.length; k++) {
  const cols = parseLine(lines[k]);
  const type = cols[iType] || '';
  const grid = cols[iTableGrid] || '';
  if (type === 'TABLE') {
    tableCount++;
    if (grid.trim().length > 0) {
      tableWithGrid++;
    }
  }
}
console.log(`  Result: ${tableWithGrid}/${tableCount} have table_grid_json\n`);

// Check notes_quality flags
console.log('QA: Rows with notes_quality flags:');
const qualityFlags = {};
for (let k = 1; k < lines.length; k++) {
  const cols = parseLine(lines[k]);
  const quality = cols[iNotesQuality] || '';
  if (quality) {
    const flags = quality.split('|');
    flags.forEach(f => {
      qualityFlags[f] = (qualityFlags[f] || 0) + 1;
    });
  }
}
Object.entries(qualityFlags).forEach(([flag, count]) => {
  console.log(`  ${flag}: ${count}`);
});

console.log('\n=== END REPORT ===');

