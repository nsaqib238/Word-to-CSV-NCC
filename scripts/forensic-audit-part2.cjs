/**
 * PHASE 1: Forensic Audit of NCC Part 2
 * Produces missingness profile and evidence set
 */

const fs = require('fs');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

function normalizeWhitespace(s) {
  return (s || '').trim();
}

function analyzePart(csvPath, partName) {
  console.log(`\n=== Analyzing ${partName} ===`);
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  
  if (lines.length === 0) {
    console.log('Empty file');
    return null;
  }
  
  const header = parseCSVLine(lines[0]);
  const headerMap = {};
  header.forEach((h, i) => { headerMap[h] = i; });
  
  const idx = {
    unit_type: headerMap['unit_type'],
    unit_label: headerMap['unit_label'],
    text: headerMap['text'],
    raw_text: headerMap['raw_text'],
    title: headerMap['title'],
    volume: headerMap['volume'],
  };
  
  const stats = {};
  
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length !== header.length) continue;
    
    const unitType = normalizeWhitespace(cols[idx.unit_type] || '');
    const text = normalizeWhitespace(cols[idx.text] || '');
    const rawText = normalizeWhitespace(cols[idx.raw_text] || '');
    const title = normalizeWhitespace(cols[idx.title] || '');
    
    if (!stats[unitType]) {
      stats[unitType] = {
        total_rows: 0,
        empty_text_rows: 0,
        empty_raw_text_rows: 0,
        empty_both_rows: 0,
        empty_text_but_title: 0,
        samples: []
      };
    }
    
    stats[unitType].total_rows++;
    const textEmpty = !text;
    const rawTextEmpty = !rawText;
    
    if (textEmpty) stats[unitType].empty_text_rows++;
    if (rawTextEmpty) stats[unitType].empty_raw_text_rows++;
    if (textEmpty && rawTextEmpty) {
      stats[unitType].empty_both_rows++;
      if (title) stats[unitType].empty_text_but_title++;
    }
    
    // Collect samples for worst cases
    if (textEmpty && stats[unitType].samples.length < 5) {
      const unitLabel = normalizeWhitespace(cols[idx.unit_label] || '');
      stats[unitType].samples.push({
        unit_label: unitLabel,
        title: title.slice(0, 120),
        raw_text: rawText.slice(0, 120) || 'EMPTY',
        text: text.slice(0, 120) || 'EMPTY',
      });
    }
  }
  
  return { stats, header, idx };
}

function classifyFailure(row) {
  const { text, raw_text, title } = row;
  const textEmpty = !normalizeWhitespace(text);
  const rawTextEmpty = !normalizeWhitespace(raw_text);
  const titleExists = !!normalizeWhitespace(title);
  
  if (rawTextEmpty && textEmpty && titleExists) {
    return 'C'; // ROW CREATED FROM STRUCTURE/TOC BUT BODY CAPTURE FAILED
  } else if (rawTextEmpty && textEmpty && !titleExists) {
    return 'C'; // BAD ROW CREATION LOGIC
  } else if (!rawTextEmpty && textEmpty) {
    return 'B'; // CLEANING/POPULATION BUG
  } else if (rawTextEmpty && textEmpty) {
    return 'A'; // EXTRACTION MISSING FROM SOURCE
  }
  return 'UNKNOWN';
}

function main() {
  const part1Path = process.argv[2] || 'ncc/ncc_units_part1.csv';
  const part2Path = process.argv[3] || 'ncc/ncc_units_part2.csv';
  const part3Path = process.argv[4] || 'ncc/ncc_units_part3.csv';
  
  console.log('=== PHASE 1: FORENSIC AUDIT ===\n');
  
  // Analyze all parts
  const part1 = fs.existsSync(part1Path) ? analyzePart(part1Path, 'Part 1') : null;
  const part2 = fs.existsSync(part2Path) ? analyzePart(part2Path, 'Part 2') : null;
  const part3 = fs.existsSync(part3Path) ? analyzePart(part3Path, 'Part 3') : null;
  
  if (!part2) {
    console.error(`Part 2 file not found: ${part2Path}`);
    process.exit(1);
  }
  
  // Missingness profile for Part 2
  console.log('\n=== MISSINGNESS PROFILE: PART 2 ===');
  console.log('unit_type | total_rows | empty_text | empty_raw_text | empty_both | empty_both_but_title');
  console.log('-' .repeat(100));
  
  const sorted = Object.entries(part2.stats)
    .sort((a, b) => b[1].empty_both_rows - a[1].empty_both_rows);
  
  sorted.forEach(([type, s]) => {
    console.log(`${type.padEnd(30)} | ${String(s.total_rows).padStart(6)} | ${String(s.empty_text_rows).padStart(6)} | ${String(s.empty_raw_text_rows).padStart(6)} | ${String(s.empty_both_rows).padStart(6)} | ${String(s.empty_text_but_title).padStart(6)}`);
  });
  
  // Top 5 worst
  console.log('\n=== TOP 5 WORST UNIT_TYPES IN PART 2 ===');
  sorted.slice(0, 5).forEach(([type, s], i) => {
    console.log(`${i + 1}. ${type}: ${s.empty_both_rows}/${s.total_rows} rows with empty both (${((s.empty_both_rows/s.total_rows)*100).toFixed(1)}%)`);
  });
  
  // Evidence set - 20 representative failing rows
  console.log('\n=== EVIDENCE SET: 20 REPRESENTATIVE FAILING ROWS ===');
  const evidenceSet = [];
  const worstTypes = sorted.slice(0, 5).map(([type]) => type);
  
  const content = fs.readFileSync(part2Path, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const header = parseCSVLine(lines[0]);
  const headerMap = {};
  header.forEach((h, i) => { headerMap[h] = i; });
  
  const idx = {
    unit_type: headerMap['unit_type'],
    unit_label: headerMap['unit_label'],
    text: headerMap['text'],
    raw_text: headerMap['raw_text'],
    title: headerMap['title'],
    path: headerMap['path'],
  };
  
  for (let i = 1; i < lines.length && evidenceSet.length < 20; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length !== header.length) continue;
    
    const unitType = normalizeWhitespace(cols[idx.unit_type] || '');
    const text = normalizeWhitespace(cols[idx.text] || '');
    const rawText = normalizeWhitespace(cols[idx.raw_text] || '');
    
    if (!text && worstTypes.includes(unitType)) {
      const row = {
        unit_label: normalizeWhitespace(cols[idx.unit_label] || ''),
        unit_type: unitType,
        title: normalizeWhitespace(cols[idx.title] || ''),
        raw_text: rawText.slice(0, 120) || 'EMPTY',
        text: text.slice(0, 120) || 'EMPTY',
        path: normalizeWhitespace(cols[idx.path] || ''),
      };
      row.failure_category = classifyFailure(row);
      evidenceSet.push(row);
    }
  }
  
  evidenceSet.forEach((row, i) => {
    console.log(`\n${i + 1}. unit_label: ${row.unit_label}`);
    console.log(`   unit_type: ${row.unit_type}`);
    console.log(`   title: ${row.title.slice(0, 80)}`);
    console.log(`   raw_text: ${row.raw_text}`);
    console.log(`   text: ${row.text}`);
    console.log(`   path: ${row.path}`);
    console.log(`   FAILURE CATEGORY: ${row.failure_category}`);
  });
  
  // Failure category summary
  const categoryCounts = {};
  evidenceSet.forEach(row => {
    categoryCounts[row.failure_category] = (categoryCounts[row.failure_category] || 0) + 1;
  });
  
  console.log('\n=== FAILURE CATEGORY SUMMARY ===');
  console.log('A) Extraction missing from source:', categoryCounts['A'] || 0);
  console.log('B) Assignment/cleaning bug:', categoryCounts['B'] || 0);
  console.log('C) Structural/anchor mismatch:', categoryCounts['C'] || 0);
  
  // Comparison with Part 1 & 3
  if (part1 || part3) {
    console.log('\n=== COMPARISON: PART 1 & 3 ===');
    const coreTypes = ['PERFORMANCE_REQUIREMENT', 'DTS_PROVISION', 'SPECIFICATION_CLAUSE', 'FUNCTIONAL_STATEMENT', 'VERIFICATION_METHOD'];
    
    coreTypes.forEach(type => {
      const p2 = part2.stats[type];
      const p1 = part1?.stats[type];
      const p3 = part3?.stats[type];
      
      if (p2 && p2.total_rows > 0) {
        console.log(`\n${type}:`);
        console.log(`  Part 2: ${p2.empty_both_rows}/${p2.total_rows} empty both (${((p2.empty_both_rows/p2.total_rows)*100).toFixed(1)}%)`);
        if (p1) console.log(`  Part 1: ${p1.empty_both_rows}/${p1.total_rows} empty both (${((p1.empty_both_rows/p1.total_rows)*100).toFixed(1)}%)`);
        if (p3) console.log(`  Part 3: ${p3.empty_both_rows}/${p3.total_rows} empty both (${((p3.empty_both_rows/p3.total_rows)*100).toFixed(1)}%)`);
      }
    });
  }
}

main();

