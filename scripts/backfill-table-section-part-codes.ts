/**
 * Backfill Script: Populate section_code and part_code for table rows
 * 
 * This script processes existing CSV files and extracts section_code/part_code
 * from table_id or unit_label when they are missing.
 * 
 * Usage:
 *   npx tsx scripts/backfill-table-section-part-codes.ts <csv-file-path>
 * 
 * Example:
 *   npx tsx scripts/backfill-table-section-part-codes.ts output/ncc_vol1_1767191688693.csv
 */

import fs from 'fs';
import path from 'path';

/**
 * Validate if a table_id matches NCC style patterns
 * Valid patterns: C1V1, S1C2A, B1D4, P2.1, etc.
 * Invalid: "1", "2", "3", "14", etc. (numeric only)
 */
function isValidNCCTableId(tableId: string): boolean {
  if (!tableId || tableId.trim() === '') return false;
  
  const cleanId = tableId.trim();
  
  // Pattern 1: Letter+Number+Letter+Number+OptionalLetter (e.g., S1C2A, C1V1, B1D4)
  // This is the most common pattern for NCC tables
  if (/^[A-Z]\d+[A-Z]\d+[a-zA-Z]?$/.test(cleanId)) {
    return true;
  }
  
  // Pattern 2: Letter+Number+Dot+Number (e.g., P2.1, V1.2)
  if (/^[A-Z]\d+\.\d+$/.test(cleanId)) {
    return true;
  }
  
  // Reject numeric-only values (e.g., "1", "2", "3", "14")
  // These are noise, not NCC table references
  if (/^\d+$/.test(cleanId)) {
    return false;
  }
  
  // Reject other non-NCC patterns
  return false;
}

/**
 * Extract section_code and part_code from a reference string
 * Handles patterns like: S1C2A, B1D4, C1V1, etc.
 */
function extractSectionAndPart(ref: string): { section: string; part: string } {
  if (!ref) return { section: '', part: '' };
  
  const cleanRef = ref.trim();
  
  // Pattern 1: Letter+Number+Letter+Number+OptionalLetter (e.g., S1C2A, C1F1, D2D1)
  // Structure: [Section Letter][Part Number][Clause Letter][Clause Number][optional suffix]
  // Example: S1C2A -> section: "S", part: "S1"
  const match = cleanRef.match(/^([A-Z])(\d+)([A-Z]\d+[a-zA-Z]?)$/);
  if (match) {
    const sectionLetter = match[1]; // "S"
    const partNumber = match[2];    // "1"
    return { section: sectionLetter, part: sectionLetter + partNumber }; // "S", "S1"
  }
  
  // Pattern 2: Letter+Number+Dot+Number (e.g., P2.1, V1.2)
  const match2 = cleanRef.match(/^([A-Z])(\d+)\.(\d+)/);
  if (match2) {
    const sectionLetter = match2[1]; // "P"
    const partNumber = match2[2];     // "2"
    return { section: sectionLetter, part: sectionLetter + partNumber }; // "P", "P2"
  }
  
  // Pattern 3: Simple Letter+Number (e.g., P2, V1, H4, B1, C1)
  const match3 = cleanRef.match(/^([A-Z])(\d+)$/);
  if (match3) {
    const sectionLetter = match3[1]; // "P"
    const partNumber = match3[2];    // "2"
    return { section: sectionLetter, part: sectionLetter + partNumber }; // "P", "P2"
  }
  
  return { section: '', part: '' };
}

/**
 * Simple CSV parser that handles quoted fields
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      fields.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }
  
  // Add last field
  fields.push(currentField);
  return fields;
}

/**
 * Escape CSV value (same logic as in process-ncc-to-excel.ts)
 */
function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '""';
  
  let str: string;
  if (typeof value === 'boolean') {
    str = value ? 'true' : 'false';
  } else if (typeof value === 'number') {
    str = String(value);
  } else {
    str = String(value);
  }
  
  // Replace newlines with spaces
  str = str.replace(/\r\n/g, ' ').replace(/\r/g, ' ').replace(/\n/g, ' ');
  
  const needsQuoting = 
    str.includes(',') || 
    str.includes('"') ||
    str.trim() !== str ||
    str === '';
  
  if (needsQuoting) {
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  }
  
  return str;
}

/**
 * Process a CSV file and backfill missing section_code/part_code for table rows
 */
function backfillCSV(csvFilePath: string): void {
  console.log(`[Backfill] Processing: ${csvFilePath}`);
  
  // Read CSV file
  const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  
  if (lines.length === 0) {
    console.error('[Backfill] Error: CSV file is empty');
    return;
  }
  
  // Parse header
  const header = parseCSVLine(lines[0]);
  const sectionCodeIndex = header.indexOf('section_code');
  const partCodeIndex = header.indexOf('part_code');
  const tableIdIndex = header.indexOf('table_id');
  const unitLabelIndex = header.indexOf('unit_label');
  
  if (sectionCodeIndex === -1 || partCodeIndex === -1) {
    console.error('[Backfill] Error: CSV missing section_code or part_code columns');
    return;
  }
  
  if (tableIdIndex === -1 && unitLabelIndex === -1) {
    console.error('[Backfill] Error: CSV missing both table_id and unit_label columns');
    return;
  }
  
  console.log(`[Backfill] Total rows: ${lines.length - 1}`);
  
  // Process rows
  let updatedCount = 0;
  let skippedCount = 0;
  const updatedLines: string[] = [lines[0]]; // Keep header
  
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    
    // Ensure we have enough fields
    while (fields.length < header.length) {
      fields.push('');
    }
    
    // Check if this is a table row that needs backfilling
    const tableId = fields[tableIdIndex] || '';
    const unitLabel = fields[unitLabelIndex] || '';
    const currentSection = fields[sectionCodeIndex] || '';
    const currentPart = fields[partCodeIndex] || '';
    
    const hasTableId = tableId.trim() !== '';
    const missingSection = currentSection.trim() === '';
    const missingPart = currentPart.trim() === '';
    
    // CRITICAL: Only process rows with valid NCC-style table_id
    // Filter out noise like "1", "2", "3", etc.
    if (hasTableId && !isValidNCCTableId(tableId)) {
      // Clear table_id and table_label for non-NCC patterns (post-processing cleanup)
      fields[tableIdIndex] = '';
      if (header.indexOf('table_label') !== -1) {
        fields[header.indexOf('table_label')] = '';
      }
      skippedCount++;
      if (skippedCount <= 10) { // Only log first 10
        console.log(`[Backfill] Filtered out non-NCC table_id: "${tableId}"`);
      }
    } else if (hasTableId && (missingSection || missingPart)) {
      // Try to extract from table_id first, then unit_label
      const refToExtract = tableId || unitLabel;
      const { section, part } = extractSectionAndPart(refToExtract);
      
      if (section && part) {
        fields[sectionCodeIndex] = section;
        fields[partCodeIndex] = part;
        updatedCount++;
      } else {
        skippedCount++;
        if (skippedCount <= 10) { // Only log first 10
          console.log(`[Backfill] Could not extract from: table_id="${tableId}", unit_label="${unitLabel}"`);
        }
      }
    }
    
    // Rebuild the line with escaped values
    const escapedFields = fields.map(escapeCSV);
    updatedLines.push(escapedFields.join(','));
  }
  
  console.log(`[Backfill] Updated ${updatedCount} rows`);
  console.log(`[Backfill] Skipped ${skippedCount} rows (could not extract)`);
  
  // Write updated CSV
  const outputPath = csvFilePath.replace(/\.csv$/, '_backfilled.csv');
  const outputContent = updatedLines.join('\n');
  
  fs.writeFileSync(outputPath, outputContent, 'utf-8');
  console.log(`[Backfill] Output written to: ${outputPath}`);
  
  // Also create a summary
  const summary = {
    inputFile: csvFilePath,
    outputFile: outputPath,
    totalRows: lines.length - 1,
    updatedRows: updatedCount,
    skippedRows: skippedCount,
    timestamp: new Date().toISOString(),
  };
  
  const summaryPath = outputPath.replace(/\.csv$/, '_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`[Backfill] Summary written to: ${summaryPath}`);
}

// Main execution
const csvFilePath = process.argv[2];

if (!csvFilePath) {
  console.error('Usage: npx ts-node scripts/backfill-table-section-part-codes.ts <csv-file-path>');
  console.error('Example: npx ts-node scripts/backfill-table-section-part-codes.ts output/ncc_vol1_1767191688693.csv');
  process.exit(1);
}

if (!fs.existsSync(csvFilePath)) {
  console.error(`Error: File not found: ${csvFilePath}`);
  process.exit(1);
}

try {
  backfillCSV(csvFilePath);
  console.log('[Backfill] Completed successfully!');
} catch (error) {
  console.error('[Backfill] Error:', error);
  process.exit(1);
}

