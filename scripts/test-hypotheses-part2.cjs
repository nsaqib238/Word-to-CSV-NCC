/**
 * PHASE 2: Test Hypotheses for Part 2 failures
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

function main() {
  const part2Path = process.argv[2] || 'ncc/ncc_units_part2.csv';
  
  console.log('=== PHASE 2: HYPOTHESIS TESTING ===\n');
  
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
  };
  
  // HYPOTHESIS H1: STATE_VARIATION instruction-only rows
  console.log('=== HYPOTHESIS H1: STATE_VARIATION instruction-only rows ===');
  const h1Matches = [];
  
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length !== header.length) continue;
    
    const unitType = normalizeWhitespace(cols[idx.unit_type] || '');
    const text = normalizeWhitespace(cols[idx.text] || '');
    const rawText = normalizeWhitespace(cols[idx.raw_text] || '');
    
    if (unitType === 'STATE_VARIATION' && !text && rawText) {
      const hasInstruction = /(Insert|Omit|Substitute|Replace)\s+(subclause|clause)/i.test(rawText);
      if (hasInstruction) {
        h1Matches.push({
          unit_label: normalizeWhitespace(cols[idx.unit_label] || ''),
          raw_text: rawText.slice(0, 200),
        });
      }
    }
  }
  
  console.log(`Count: ${h1Matches.length} STATE_VARIATION rows with empty text but instruction keywords in raw_text`);
  console.log('\nExamples (first 10):');
  h1Matches.slice(0, 10).forEach((m, i) => {
    console.log(`${i + 1}. ${m.unit_label}: ${m.raw_text.slice(0, 150)}...`);
  });
  console.log(`\nH1 VERDICT: ${h1Matches.length > 0 ? 'PROVEN' : 'NOT PROVEN'}\n`);
  
  // HYPOTHESIS H2: FUNCTIONAL_STATEMENT bodies not captured
  console.log('=== HYPOTHESIS H2: FUNCTIONAL_STATEMENT bodies not captured ===');
  const h2Matches = [];
  const labelPatterns = new Set();
  
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length !== header.length) continue;
    
    const unitType = normalizeWhitespace(cols[idx.unit_type] || '');
    const text = normalizeWhitespace(cols[idx.text] || '');
    const rawText = normalizeWhitespace(cols[idx.raw_text] || '');
    const title = normalizeWhitespace(cols[idx.title] || '');
    const unitLabel = normalizeWhitespace(cols[idx.unit_label] || '');
    
    if (unitType === 'FUNCTIONAL_STATEMENT' && title && !rawText && !text) {
      h2Matches.push({
        unit_label: unitLabel,
        title: title.slice(0, 100),
      });
      
      // Extract prefix pattern (e.g., H7F2 -> H7)
      const m = unitLabel.match(/^([A-Z]\d+)/);
      if (m?.[1]) labelPatterns.add(m[1]);
    }
  }
  
  console.log(`Count: ${h2Matches.length} FUNCTIONAL_STATEMENT rows with title but empty raw_text and text`);
  console.log('\nLabel prefix patterns found:');
  Array.from(labelPatterns).sort().forEach(p => console.log(`  ${p}*`));
  console.log('\nExamples (first 10):');
  h2Matches.slice(0, 10).forEach((m, i) => {
    console.log(`${i + 1}. ${m.unit_label}: ${m.title}`);
  });
  console.log(`\nH2 VERDICT: ${h2Matches.length > 0 ? 'PROVEN' : 'NOT PROVEN'}\n`);
  
  // HYPOTHESIS H3: VERIFICATION_METHOD similar issue
  console.log('=== HYPOTHESIS H3: VERIFICATION_METHOD bodies not captured ===');
  const h3Matches = [];
  const vmLabelPatterns = new Set();
  
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length !== header.length) continue;
    
    const unitType = normalizeWhitespace(cols[idx.unit_type] || '');
    const text = normalizeWhitespace(cols[idx.text] || '');
    const rawText = normalizeWhitespace(cols[idx.raw_text] || '');
    const title = normalizeWhitespace(cols[idx.title] || '');
    const unitLabel = normalizeWhitespace(cols[idx.unit_label] || '');
    
    if (unitType === 'VERIFICATION_METHOD' && title && !rawText && !text) {
      h3Matches.push({
        unit_label: unitLabel,
        title: title.slice(0, 100),
      });
      
      const m = unitLabel.match(/^([A-Z]\d+)/);
      if (m?.[1]) vmLabelPatterns.add(m[1]);
    }
  }
  
  console.log(`Count: ${h3Matches.length} VERIFICATION_METHOD rows with title but empty raw_text and text`);
  console.log('\nLabel prefix patterns found:');
  Array.from(vmLabelPatterns).sort().forEach(p => console.log(`  ${p}*`));
  console.log('\nExamples (first 10):');
  h3Matches.slice(0, 10).forEach((m, i) => {
    console.log(`${i + 1}. ${m.unit_label}: ${m.title}`);
  });
  console.log(`\nH3 VERDICT: ${h3Matches.length > 0 ? 'PROVEN' : 'NOT PROVEN'}\n`);
  
  // Summary
  console.log('=== HYPOTHESIS SUMMARY ===');
  console.log(`H1 (STATE_VARIATION instruction-only): ${h1Matches.length > 0 ? 'PROVEN' : 'NOT PROVEN'} (${h1Matches.length} matches)`);
  console.log(`H2 (FUNCTIONAL_STATEMENT missing bodies): ${h2Matches.length > 0 ? 'PROVEN' : 'NOT PROVEN'} (${h2Matches.length} matches)`);
  console.log(`H3 (VERIFICATION_METHOD missing bodies): ${h3Matches.length > 0 ? 'PROVEN' : 'NOT PROVEN'} (${h3Matches.length} matches)`);
}

main();

