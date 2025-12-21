/**
 * Verify CSV Identity Fields
 * 
 * Tests that identity fields (applies_to_volume, section_code, part_code, indexable)
 * are properly populated in the generated CSV.
 */

import fs from 'fs';
import path from 'path';

interface CSVRow {
  [key: string]: string;
}

function parseCSV(csvContent: string): CSVRow[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const rows: CSVRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: CSVRow = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

function verifyCSV(csvPath: string) {
  console.log(`\n🔍 Verifying CSV: ${csvPath}\n`);
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    return;
  }
  
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  if (rows.length === 0) {
    console.error('❌ No rows found in CSV');
    return;
  }
  
  console.log(`📊 Total rows: ${rows.length}\n`);
  
  // Check applies_to_volume
  const hasVolume = rows.filter(r => r.applies_to_volume && r.applies_to_volume !== '' && r.applies_to_volume !== 'NaN').length;
  const volumePercent = (hasVolume / rows.length * 100).toFixed(1);
  console.log(`✅ applies_to_volume populated: ${hasVolume}/${rows.length} (${volumePercent}%)`);
  
  // Check section_code
  const hasSection = rows.filter(r => r.section_code && r.section_code !== '' && r.section_code !== 'NaN').length;
  const sectionPercent = (hasSection / rows.length * 100).toFixed(1);
  console.log(`✅ section_code populated: ${hasSection}/${rows.length} (${sectionPercent}%)`);
  
  // Check part_code
  const hasPart = rows.filter(r => r.part_code && r.part_code !== '' && r.part_code !== 'NaN').length;
  const partPercent = (hasPart / rows.length * 100).toFixed(1);
  console.log(`✅ part_code populated: ${hasPart}/${rows.length} (${partPercent}%)`);
  
  // Check indexable
  const indexableCount = rows.filter(r => r.indexable === 'true' || r.indexable === 'True').length;
  const indexablePercent = (indexableCount / rows.length * 100).toFixed(1);
  console.log(`✅ indexable=true: ${indexableCount}/${rows.length} (${indexablePercent}%)`);
  
  // Check path (optional)
  const hasPath = rows.filter(r => r.path && r.path !== '' && r.path !== 'NaN').length;
  const pathPercent = (hasPath / rows.length * 100).toFixed(1);
  console.log(`ℹ️  path populated: ${hasPath}/${rows.length} (${pathPercent}%) [optional]`);
  
  // Sample rows with identity
  console.log(`\n📋 Sample rows with complete identity (first 5):`);
  const completeIdentity = rows.filter(r => 
    r.applies_to_volume && r.applies_to_volume !== '' && r.applies_to_volume !== 'NaN' &&
    r.section_code && r.section_code !== '' && r.section_code !== 'NaN' &&
    r.part_code && r.part_code !== '' && r.part_code !== 'NaN' &&
    (r.indexable === 'true' || r.indexable === 'True')
  ).slice(0, 5);
  
  completeIdentity.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.unit_label || 'N/A'}: volume=${r.applies_to_volume}, section=${r.section_code}, part=${r.part_code}, indexable=${r.indexable}`);
  });
  
  // Sample rows missing identity
  console.log(`\n⚠️  Sample rows missing identity (first 5):`);
  const missingIdentity = rows.filter(r => 
    (!r.applies_to_volume || r.applies_to_volume === '' || r.applies_to_volume === 'NaN') ||
    (!r.section_code || r.section_code === '' || r.section_code === 'NaN') ||
    (!r.part_code || r.part_code === '' || r.part_code === 'NaN')
  ).slice(0, 5);
  
  missingIdentity.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.unit_label || 'N/A'}: volume=${r.applies_to_volume || 'MISSING'}, section=${r.section_code || 'MISSING'}, part=${r.part_code || 'MISSING'}`);
  });
  
  // Check unit_label patterns
  console.log(`\n🔤 Unit label patterns (sample):`);
  const sampleLabels = rows.filter(r => r.unit_label && r.unit_label !== '').slice(0, 10);
  sampleLabels.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.unit_label} → section=${r.section_code || '?'}, part=${r.part_code || '?'}`);
  });
  
  // Summary
  console.log(`\n📈 Summary:`);
  console.log(`  ✅ Complete identity: ${completeIdentity.length} rows`);
  console.log(`  ⚠️  Missing identity: ${missingIdentity.length} rows`);
  console.log(`  📊 Indexable: ${indexableCount} rows`);
  
  if (hasVolume > 0 && hasSection > 0 && hasPart > 0 && indexableCount > 0) {
    console.log(`\n✅ CSV identity fields are populated!`);
  } else {
    console.log(`\n❌ CSV identity fields need fixing.`);
  }
}

// Main
const csvPath = process.argv[2] || path.join(process.cwd(), 'ncc', 'ncc_units.csv');
verifyCSV(csvPath);

