import fs from 'fs';
import path from 'path';

/**
 * Analyze CSV file to find empty columns
 */
function analyzeCSV(csvPath: string) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  
  if (lines.length === 0) {
    console.error('Empty CSV file');
    return;
  }

  // Parse header
  const header = parseCSVLine(lines[0]);
  const columnCounts: Record<string, { total: number; empty: number; nonEmpty: number }> = {};
  
  // Initialize counts
  header.forEach(col => {
    columnCounts[col] = { total: 0, empty: 0, nonEmpty: 0 };
  });

  // Analyze data rows
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length !== header.length) {
      console.warn(`Row ${i} has ${row.length} columns, expected ${header.length}`);
      continue;
    }

    header.forEach((col, idx) => {
      columnCounts[col].total++;
      const value = row[idx]?.trim() || '';
      
      // Boolean fields: 'false' is a valid value (means "does not contain"), not empty
      const isBooleanField = col === 'contains_shall' || col === 'contains_must' || col === 'indexable';
      
      if (isBooleanField) {
        // For boolean fields, only count as empty if truly missing
        if (value === '' || value === 'null' || value === 'undefined') {
          columnCounts[col].empty++;
        } else {
          columnCounts[col].nonEmpty++;
        }
      } else {
        // For other fields, count empty arrays, empty strings, and '0' as empty
        if (value === '' || value === '[]' || value === '0') {
          columnCounts[col].empty++;
        } else {
          columnCounts[col].nonEmpty++;
        }
      }
    });
  }

  // Report results
  console.log(`\n📊 Analysis of ${path.basename(csvPath)}`);
  console.log(`Total rows: ${lines.length - 1}`);
  console.log(`Total columns: ${header.length}\n`);

  // Sort by empty percentage (most empty first)
  const sorted = Object.entries(columnCounts)
    .map(([col, stats]) => ({
      column: col,
      empty: stats.empty,
      nonEmpty: stats.nonEmpty,
      total: stats.total,
      emptyPercent: (stats.empty / stats.total * 100).toFixed(1),
    }))
    .sort((a, b) => parseFloat(b.emptyPercent) - parseFloat(a.emptyPercent));

  console.log('Columns sorted by empty percentage:\n');
  console.log('Column Name'.padEnd(35) + 'Empty'.padEnd(10) + 'Non-Empty'.padEnd(12) + 'Empty %');
  console.log('-'.repeat(70));

  sorted.forEach(({ column, empty, nonEmpty, emptyPercent }) => {
    const marker = parseFloat(emptyPercent) === 100 ? '🔴' : 
                   parseFloat(emptyPercent) > 90 ? '🟠' : 
                   parseFloat(emptyPercent) > 50 ? '🟡' : '🟢';
    console.log(
      `${marker} ${column.padEnd(33)}${empty.toString().padEnd(10)}${nonEmpty.toString().padEnd(12)}${emptyPercent}%`
    );
  });

  // Summary
  const fullyEmpty = sorted.filter(s => parseFloat(s.emptyPercent) === 100);
  const mostlyEmpty = sorted.filter(s => parseFloat(s.emptyPercent) > 90 && parseFloat(s.emptyPercent) < 100);
  const halfEmpty = sorted.filter(s => parseFloat(s.emptyPercent) > 50 && parseFloat(s.emptyPercent) <= 90);

  console.log(`\n📈 Summary:`);
  console.log(`  🔴 Fully empty (100%): ${fullyEmpty.length} columns`);
  console.log(`  🟠 Mostly empty (>90%): ${mostlyEmpty.length} columns`);
  console.log(`  🟡 Half empty (>50%): ${halfEmpty.length} columns`);
  console.log(`  🟢 Mostly populated: ${sorted.length - fullyEmpty.length - mostlyEmpty.length - halfEmpty.length} columns`);

  if (fullyEmpty.length > 0) {
    console.log(`\n🔴 Fully empty columns:`);
    fullyEmpty.forEach(({ column }) => console.log(`   - ${column}`));
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current);
  return result;
}

// Main
const csvFile = process.argv[2] || 'output/ncc_v2.csv';
const absPath = path.isAbsolute(csvFile) ? csvFile : path.join(process.cwd(), csvFile);

if (!fs.existsSync(absPath)) {
  console.error(`❌ File not found: ${absPath}`);
  process.exit(1);
}

analyzeCSV(absPath);

