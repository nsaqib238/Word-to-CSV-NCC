/**
 * Final corrective patch for NCC CSV dataset
 * Fixes: missing text, unlinked state variations, conditional logic extraction
 */

const fs = require('fs');

// Helper functions from ncc-units.ts
function normalizeWhitespace(s) {
  return (s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanNccTextKeepingNumbering(raw) {
  let s = raw || '';
  // Hyphenation across line breaks
  s = s.replace(/([a-z])-\s*\n\s*([a-z])/gi, '$1$2');
  // Normalize whitespace
  s = normalizeWhitespace(s);
  return s;
}

function extractBaseUnitLabel(stateVarText, unitLabel, affectedUnitLabel) {
  // Priority 1: affected_unit_label
  if (affectedUnitLabel) {
    const m = affectedUnitLabel.match(/^([A-Z]\d+[A-Z]\d+)/);
    if (m?.[1]) return m[1];
  }
  // Priority 2: unit_label if it's a base label
  if (unitLabel) {
    if (/^[A-Z]\d+[A-Z]\d+$/.test(unitLabel)) return unitLabel;
    const m = unitLabel.match(/(?:^|\s)([A-Z]\d+[A-Z]\d+)(?:\(|$)/);
    if (m?.[1]) return m[1];
  }
  // Priority 3: extract from text
  const m = stateVarText.match(/\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\s+([A-Z]\d+[A-Z]\d+)/i);
  if (m?.[2]) return m[2];
  const m2 = stateVarText.match(/\b([A-Z]\d+[A-Z]\d+)(?:\(\d+\))?/);
  if (m2?.[1]) return m2[1];
  return '';
}

function extractConditionsText(text) {
  if (!text) return '';
  const conditions = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  for (const sent of sentences) {
    const trimmed = normalizeWhitespace(sent);
    if (/\b(if|where|unless|when|provided that|subject to)\b/i.test(trimmed)) {
      conditions.push(trimmed);
    }
  }
  return conditions.join(' | ');
}

function extractExceptionsText(text) {
  if (!text) return '';
  const exceptions = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  for (const sent of sentences) {
    const trimmed = normalizeWhitespace(sent);
    if (/\b(does not apply|except|exempt|exclusion|notwithstanding)\b/i.test(trimmed)) {
      exceptions.push(trimmed);
    }
  }
  return exceptions.join(' | ');
}

// Parse CSV line handling quoted fields
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

// Escape CSV field
function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function main() {
  const inputFile = process.argv[2] || 'ncc/ncc_units.csv';
  const outputFile = process.argv[3] || inputFile.replace('.csv', '_patched.csv');
  
  console.log(`Reading: ${inputFile}`);
  const content = fs.readFileSync(inputFile, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  
  if (lines.length === 0) {
    console.error('Empty file');
    process.exit(1);
  }
  
  const header = parseCSVLine(lines[0]);
  const headerMap = {};
  header.forEach((h, i) => { headerMap[h] = i; });
  
  // Required column indices
  const idx = {
    unit_type: headerMap['unit_type'],
    unit_label: headerMap['unit_label'],
    text: headerMap['text'],
    raw_text: headerMap['raw_text'],
    rag_text: headerMap['rag_text'], // Optional
    notes: headerMap['notes'],
    asset_alt_text: headerMap['asset_alt_text'],
    title: headerMap['title'],
    base_unit_label: headerMap['base_unit_label'],
    affected_unit_label: headerMap['affected_unit_label'],
    conditions_text: headerMap['conditions_text'],
    exceptions_text: headerMap['exceptions_text'],
    notes_quality: headerMap['notes_quality'],
  };
  
  // Verify critical columns exist
  const criticalCols = ['unit_type', 'unit_label', 'text', 'raw_text', 'base_unit_label', 
                        'affected_unit_label', 'conditions_text', 'exceptions_text', 'notes_quality'];
  for (const key of criticalCols) {
    if (idx[key] === undefined) {
      console.error(`Missing required column: ${key}`);
      process.exit(1);
    }
  }
  
  const coreTypes = ['PERFORMANCE_REQUIREMENT', 'DTS_PROVISION', 'SPECIFICATION_CLAUSE'];
  let fixedTextCount = 0;
  let fixedBaseLabelCount = 0;
  let fixedConditionsCount = 0;
  let unresolvedTextCount = 0;
  let unlinkedVariationCount = 0;
  
  const outputLines = [lines[0]]; // Header
  
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length !== header.length) {
      console.warn(`Row ${i} has ${cols.length} columns, expected ${header.length}. Skipping.`);
      outputLines.push(lines[i]);
      continue;
    }
    
    const unitType = (cols[idx.unit_type] || '').trim();
    const unitLabel = (cols[idx.unit_label] || '').trim();
    let text = (cols[idx.text] || '').trim();
    const rawText = (cols[idx.raw_text] || '').trim();
    const ragText = idx.rag_text !== undefined ? (cols[idx.rag_text] || '').trim() : '';
    const notes = (cols[idx.notes] || '').trim();
    const assetAltText = (cols[idx.asset_alt_text] || '').trim();
    const title = (cols[idx.title] || '').trim();
    let baseUnitLabel = (cols[idx.base_unit_label] || '').trim();
    const affectedUnitLabel = (cols[idx.affected_unit_label] || '').trim();
    let conditionsText = (cols[idx.conditions_text] || '').trim();
    let exceptionsText = (cols[idx.exceptions_text] || '').trim();
    let notesQuality = (cols[idx.notes_quality] || '').trim();
    const qualityFlags = new Set(notesQuality ? notesQuality.split('|').filter(Boolean) : []);
    
    // FINDING 1: Fix empty text for core legal rows
    if (coreTypes.includes(unitType) && !normalizeWhitespace(text)) {
      let recovered = false;
      
      // Try raw_text first
      if (rawText && normalizeWhitespace(rawText)) {
        text = cleanNccTextKeepingNumbering(rawText);
        recovered = true;
      } else if (ragText) {
        // Extract from rag_text
        let extracted = '';
        const ragMatch1 = ragText.match(/text:\s*(.+?)(?:\n|$)/s);
        if (ragMatch1?.[1]) extracted = ragMatch1[1];
        if (!extracted) {
          const ragMatch2 = ragText.match(/\[.*?\]\s*[^\n]+\n(.+)/s);
          if (ragMatch2?.[1]) extracted = ragMatch2[1];
        }
        if (!extracted) {
          const ragLines = ragText.split('\n').slice(1);
          extracted = ragLines.join('\n');
        }
        if (extracted && normalizeWhitespace(extracted)) {
          text = cleanNccTextKeepingNumbering(extracted);
          recovered = true;
        }
      }
      
      // For SPECIFICATION_CLAUSE, try other sources
      if (!recovered && unitType === 'SPECIFICATION_CLAUSE') {
        if (assetAltText && normalizeWhitespace(assetAltText)) {
          text = cleanNccTextKeepingNumbering(assetAltText);
          recovered = true;
        } else if (notes && normalizeWhitespace(notes)) {
          text = cleanNccTextKeepingNumbering(notes);
          recovered = true;
        } else if (title && normalizeWhitespace(title) && title.length > 20) {
          text = cleanNccTextKeepingNumbering(title);
          recovered = true;
        }
      }
      
      if (recovered) {
        fixedTextCount++;
        qualityFlags.delete('MISSING_TEXT');
        qualityFlags.delete('MISSING_TEXT_UNRESOLVED');
      } else {
        unresolvedTextCount++;
        qualityFlags.add('MISSING_TEXT_UNRESOLVED');
      }
    }
    
    // FINDING 2: Fix missing base_unit_label for STATE_VARIATION
    if (unitType === 'STATE_VARIATION' && !baseUnitLabel) {
      const fullText = [text, ragText, rawText, title].filter(Boolean).join(' ');
      baseUnitLabel = extractBaseUnitLabel(fullText, unitLabel, affectedUnitLabel);
      
      if (baseUnitLabel) {
        fixedBaseLabelCount++;
        qualityFlags.delete('UNLINKED_VARIATION');
      } else {
        unlinkedVariationCount++;
        qualityFlags.add('UNLINKED_VARIATION');
      }
    }
    
    // FINDING 3: Extract conditional logic if missing
    const fullText = [text, notes].filter(Boolean).join(' ');
    const hasConditionalKeywords = /\b(if|where|unless|except|does not apply|exempt)\b/i.test(fullText);
    
    if (hasConditionalKeywords && !conditionsText && !exceptionsText) {
      const extractedConditions = extractConditionsText(fullText);
      const extractedExceptions = extractExceptionsText(fullText);
      
      if (extractedConditions || extractedExceptions) {
        conditionsText = extractedConditions;
        exceptionsText = extractedExceptions;
        fixedConditionsCount++;
        qualityFlags.delete('CONDITION_NOT_EXTRACTED');
      } else {
        qualityFlags.add('CONDITION_NOT_EXTRACTED');
      }
    }
    
    // Update columns
    cols[idx.text] = text;
    cols[idx.base_unit_label] = baseUnitLabel;
    cols[idx.conditions_text] = conditionsText;
    cols[idx.exceptions_text] = exceptionsText;
    cols[idx.notes_quality] = Array.from(qualityFlags).join('|');
    
    outputLines.push(cols.map(csvEscape).join(','));
  }
  
  // Write output
  fs.writeFileSync(outputFile, outputLines.join('\n'), 'utf8');
  
  // QA Summary
  console.log('\n=== QA SUMMARY ===');
  console.log(`Rows fixed for missing text: ${fixedTextCount}`);
  console.log(`Rows with unresolved text: ${unresolvedTextCount}`);
  console.log(`STATE_VARIATION rows fixed (base_unit_label): ${fixedBaseLabelCount}`);
  console.log(`STATE_VARIATION rows still unlinked: ${unlinkedVariationCount}`);
  console.log(`Rows fixed for conditional logic: ${fixedConditionsCount}`);
  console.log(`\nOutput written to: ${outputFile}`);
  
  // Final verification
  const finalLines = fs.readFileSync(outputFile, 'utf8').split(/\r?\n/).filter(l => l.trim());
  let emptyCoreTextCount = 0;
  let unlinkedVarCount = 0;
  
  for (let i = 1; i < finalLines.length; i++) {
    const cols = parseCSVLine(finalLines[i]);
    if (cols.length !== header.length) continue;
    
    const ut = cols[idx.unit_type] || '';
    const txt = cols[idx.text] || '';
    const bl = cols[idx.base_unit_label] || '';
    
    if (coreTypes.includes(ut) && !normalizeWhitespace(txt)) {
      emptyCoreTextCount++;
    }
    if (ut === 'STATE_VARIATION' && !bl) {
      unlinkedVarCount++;
    }
  }
  
  console.log('\n=== FINAL VERIFICATION ===');
  console.log(`Core legal rows with empty text: ${emptyCoreTextCount} (should be 0)`);
  console.log(`STATE_VARIATION rows without base_unit_label: ${unlinkedVarCount}`);
  
  if (emptyCoreTextCount > 0) {
    console.error(`\n❌ FAILED: ${emptyCoreTextCount} core legal rows still have empty text`);
    process.exit(1);
  }
  
  console.log('\n✅ SUCCESS: All core legal rows have text');
  if (unlinkedVarCount > 0) {
    console.log(`⚠️  WARNING: ${unlinkedVarCount} STATE_VARIATION rows still unlinked (flagged in notes_quality)`);
  }
}

main();

