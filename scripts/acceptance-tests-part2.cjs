/**
 * PHASE 4: Acceptance Tests for Part 2 fixes
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
  const beforeFile = process.argv[2] || 'ncc/ncc_units_part2.csv';
  const afterFile = process.argv[3] || 'ncc/ncc_units_part2_fixed.csv';
  
  console.log('=== PHASE 4: ACCEPTANCE TESTS ===\n');
  
  function analyzeFile(filePath, label) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    const header = parseCSVLine(lines[0]);
    const headerMap = {};
    header.forEach((h, i) => { headerMap[h] = i; });
    
    const idx = {
      unit_type: headerMap['unit_type'],
      unit_label: headerMap['unit_label'],
      text: headerMap['text'],
      raw_text: headerMap['raw_text'],
      base_unit_label: headerMap['base_unit_label'],
      notes_quality: headerMap['notes_quality'],
    };
    
    const coreTypes = ['PERFORMANCE_REQUIREMENT', 'DTS_PROVISION', 'SPECIFICATION_CLAUSE'];
    const emptyCoreText = [];
    const emptyStateVar = [];
    const emptyStateVarUnresolved = [];
    const unlinkedStateVar = [];
    const emptyFunctional = [];
    const emptyVerification = [];
    
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (cols.length !== header.length) continue;
      
      const unitType = normalizeWhitespace(cols[idx.unit_type] || '');
      const text = normalizeWhitespace(cols[idx.text] || '');
      const rawText = normalizeWhitespace(cols[idx.raw_text] || '');
      const baseLabel = normalizeWhitespace(cols[idx.base_unit_label] || '');
      const notesQuality = normalizeWhitespace(cols[idx.notes_quality] || '');
      const unitLabel = normalizeWhitespace(cols[idx.unit_label] || '');
      
      if (coreTypes.includes(unitType) && !text) {
        emptyCoreText.push(unitLabel || 'UNLABELED');
      }
      
      if (unitType === 'STATE_VARIATION') {
        if (!text) {
          if (!rawText || notesQuality.includes('MISSING_TEXT_UNRESOLVED')) {
            emptyStateVarUnresolved.push(unitLabel);
          } else {
            emptyStateVar.push(unitLabel);
          }
        }
        if (!baseLabel && !notesQuality.includes('UNLINKED_VARIATION')) {
          unlinkedStateVar.push(unitLabel);
        }
      }
      
      if (unitType === 'FUNCTIONAL_STATEMENT' && !text) {
        emptyFunctional.push(unitLabel);
      }
      
      if (unitType === 'VERIFICATION_METHOD' && !text) {
        emptyVerification.push(unitLabel);
      }
    }
    
    return {
      emptyCoreText,
      emptyStateVar,
      emptyStateVarUnresolved,
      unlinkedStateVar,
      emptyFunctional,
      emptyVerification,
    };
  }
  
  const before = analyzeFile(beforeFile, 'BEFORE');
  const after = analyzeFile(afterFile, 'AFTER');
  
  console.log('=== A) CORE LEGAL TEXT COMPLETENESS ===');
  console.log(`BEFORE: ${before.emptyCoreText.length} core legal rows with empty text`);
  if (before.emptyCoreText.length > 0) {
    console.log('  Labels:', before.emptyCoreText.slice(0, 10).join(', '));
  }
  console.log(`AFTER: ${after.emptyCoreText.length} core legal rows with empty text`);
  if (after.emptyCoreText.length > 0) {
    console.log('  Labels:', after.emptyCoreText.slice(0, 10).join(', '));
    console.log('  ❌ FAILED: Must be 0');
  } else {
    console.log('  ✅ PASSED');
  }
  
  console.log('\n=== B) STATE VARIATION QUALITY ===');
  console.log(`BEFORE: ${before.emptyStateVar.length} STATE_VARIATION rows with empty text (resolvable)`);
  console.log(`        ${before.emptyStateVarUnresolved.length} STATE_VARIATION rows with empty text (unresolved)`);
  console.log(`AFTER: ${after.emptyStateVar.length} STATE_VARIATION rows with empty text (resolvable)`);
  console.log(`       ${after.emptyStateVarUnresolved.length} STATE_VARIATION rows with empty text (unresolved)`);
  if (after.emptyStateVar.length === 0) {
    console.log('  ✅ PASSED: All resolvable STATE_VARIATION rows have text');
  } else {
    console.log('  ❌ FAILED: Some STATE_VARIATION rows still empty');
    console.log('    Labels:', after.emptyStateVar.slice(0, 10).join(', '));
  }
  
  console.log(`\nBEFORE: ${before.unlinkedStateVar.length} STATE_VARIATION rows without base_unit_label`);
  console.log(`AFTER: ${after.unlinkedStateVar.length} STATE_VARIATION rows without base_unit_label`);
  if (after.unlinkedStateVar.length === 0) {
    console.log('  ✅ PASSED: All STATE_VARIATION rows have base_unit_label or UNLINKED_VARIATION flag');
  } else {
    console.log('  ⚠️  WARNING: Some STATE_VARIATION rows still unlinked');
  }
  
  console.log('\n=== C) FUNCTIONAL STATEMENT RECOVERY ===');
  console.log(`BEFORE: ${before.emptyFunctional.length} FUNCTIONAL_STATEMENT rows with empty text`);
  console.log(`AFTER: ${after.emptyFunctional.length} FUNCTIONAL_STATEMENT rows with empty text`);
  const functionalImprovement = before.emptyFunctional.length > 0 
    ? ((before.emptyFunctional.length - after.emptyFunctional.length) / before.emptyFunctional.length * 100).toFixed(1)
    : 0;
  console.log(`Improvement: ${functionalImprovement}% reduction`);
  
  if (after.emptyFunctional.length <= before.emptyFunctional.length * 0.2) {
    console.log('  ✅ PASSED: At least 80% improvement');
  } else {
    console.log('  ❌ FAILED: Less than 80% improvement');
    console.log('    Remaining labels:', after.emptyFunctional.slice(0, 10).join(', '));
  }
  
  console.log('\n=== D) VERIFICATION METHOD RECOVERY ===');
  console.log(`BEFORE: ${before.emptyVerification.length} VERIFICATION_METHOD rows with empty text`);
  console.log(`AFTER: ${after.emptyVerification.length} VERIFICATION_METHOD rows with empty text`);
  const verificationImprovement = before.emptyVerification.length > 0 
    ? ((before.emptyVerification.length - after.emptyVerification.length) / before.emptyVerification.length * 100).toFixed(1)
    : 0;
  console.log(`Improvement: ${verificationImprovement}% reduction`);
  
  if (after.emptyVerification.length <= before.emptyVerification.length * 0.2) {
    console.log('  ✅ PASSED: At least 80% improvement');
  } else {
    console.log('  ❌ FAILED: Less than 80% improvement');
    console.log('    Remaining labels:', after.emptyVerification.slice(0, 10).join(', '));
  }
  
  console.log('\n=== SUMMARY ===');
  const allPassed = 
    after.emptyCoreText.length === 0 &&
    after.emptyStateVar.length === 0 &&
    after.emptyFunctional.length <= before.emptyFunctional.length * 0.2 &&
    after.emptyVerification.length <= before.emptyVerification.length * 0.2;
  
  if (allPassed) {
    console.log('✅ ALL ACCEPTANCE TESTS PASSED');
  } else {
    console.log('❌ SOME ACCEPTANCE TESTS FAILED');
    process.exit(1);
  }
}

main();

