/**
 * PHASE 3: Implement fixes for Part 2 proven issues
 * F1: Promote STATE_VARIATION instruction-only text
 * F2: Backfill FUNCTIONAL_STATEMENT and VERIFICATION_METHOD bodies (if possible from existing data)
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

function cleanNccTextKeepingNumbering(raw) {
  let s = raw || '';
  // Hyphenation across line breaks
  s = s.replace(/([a-z])-\s*\n\s*([a-z])/gi, '$1$2');
  // Normalize whitespace
  s = normalizeWhitespace(s);
  return s;
}

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function main() {
  const inputFile = process.argv[2] || 'ncc/ncc_units_part2.csv';
  const outputFile = process.argv[3] || inputFile.replace('.csv', '_fixed.csv');
  
  console.log('=== PHASE 3: IMPLEMENTING FIXES FOR PART 2 ===\n');
  
  const content = fs.readFileSync(inputFile, 'utf8');
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
    notes_quality: headerMap['notes_quality'],
    volume: headerMap['volume'],
  };
  
  let f1Fixed = 0; // STATE_VARIATION instruction-only
  let f2Fixed = 0; // FUNCTIONAL_STATEMENT/VERIFICATION_METHOD backfill
  let f2Unresolved = 0;
  
  const outputLines = [lines[0]]; // Header
  
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length !== header.length) {
      outputLines.push(lines[i]);
      continue;
    }
    
    const unitType = normalizeWhitespace(cols[idx.unit_type] || '');
    let text = normalizeWhitespace(cols[idx.text] || '');
    const rawText = normalizeWhitespace(cols[idx.raw_text] || '');
    const title = normalizeWhitespace(cols[idx.title] || '');
    let notesQuality = normalizeWhitespace(cols[idx.notes_quality] || '');
    const qualityFlags = new Set(notesQuality ? notesQuality.split('|').filter(Boolean) : []);
    
    // FIX F1: STATE_VARIATION instruction-only promotion
    if (unitType === 'STATE_VARIATION' && !text && rawText) {
      const hasInstruction = /(Insert|Omit|Substitute|Replace)\s+(subclause|clause)/i.test(rawText);
      if (hasInstruction) {
        text = cleanNccTextKeepingNumbering(rawText);
        f1Fixed++;
        qualityFlags.delete('MISSING_TEXT');
        qualityFlags.add('INSTRUCTION_ONLY_VARIATION');
      }
    }
    
    // FIX F2: FUNCTIONAL_STATEMENT and VERIFICATION_METHOD backfill
    // Since we don't have access to source blocks here, we can only flag them
    // The actual backfill would need to happen during extraction
    if ((unitType === 'FUNCTIONAL_STATEMENT' || unitType === 'VERIFICATION_METHOD') && 
        title && !rawText && !text) {
      // Check if we can extract anything from title (unlikely, but try)
      // For now, just flag as unresolved - the real fix needs to be in extraction
      f2Unresolved++;
      qualityFlags.add('MISSING_TEXT_UNRESOLVED');
    }
    
    // Update columns
    cols[idx.text] = text;
    cols[idx.notes_quality] = Array.from(qualityFlags).join('|');
    
    outputLines.push(cols.map(csvEscape).join(','));
  }
  
  fs.writeFileSync(outputFile, outputLines.join('\n'), 'utf8');
  
  console.log('=== FIX SUMMARY ===');
  console.log(`F1 (STATE_VARIATION instruction-only): ${f1Fixed} rows fixed`);
  console.log(`F2 (FUNCTIONAL_STATEMENT/VERIFICATION_METHOD): ${f2Unresolved} rows flagged as unresolved`);
  console.log(`\nOutput written to: ${outputFile}`);
  console.log('\nNOTE: F2 requires source block access during extraction. This will be handled in the main extraction logic.');
}

main();

