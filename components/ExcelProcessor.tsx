/**
 * Excel Processor Component
 *
 * Extracted from `pages/excel-processor.tsx` so it can be embedded inside
 * the Title Page -> Clauses tab while preserving the standalone route.
 */

import { useState, useRef } from 'react';
import {
  Box,
  Button,
  Container,
  Paper,
  Typography,
  Alert,
  CircularProgress,
  TextField,
} from '@mui/material';
import {
  Upload as UploadIcon,
  FileDownload as ExportIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';

interface ExcelRow {
  'Clause Number'?: string;
  'Clause Text'?: string;
  'Notes'?: string;
  'Exceptions'?: string;
  'Warnings'?: string;
  'Jurisdiction'?: string;
  [key: string]: any;
}

interface CSVRow {
  id: string;
  clause_number: string;
  heading: string;
  body: string;
  notes: string;
  exceptions: string;
  level: number;
  parent_number: string;
  parent_id: string;
  appendix_flag: boolean;
  embeddable: boolean;
  is_heading_only: boolean;
  had_duplicate_merge: boolean;
  source_rows: string;
}

export default function ExcelProcessor() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [excelData, setExcelData] = useState<ExcelRow[] | null>(null);
  const [standardPrefix, setStandardPrefix] = useState<string>('as3000');
  const [csvData, setCsvData] = useState<CSVRow[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Fix comma corruption in clause numbers (OCR errors where dots become commas)
   * Returns { fixed: string, hasCorruption: boolean, isAmbiguous: boolean, corruptionNote: string }
   */
  function fixCommaCorruption(clauseNumber: string): {
    fixed: string;
    hasCorruption: boolean;
    isAmbiguous: boolean;
    corruptionNote: string;
  } {
    let fixed = clauseNumber;
    let hasCorruption = false;
    let isAmbiguous = false;
    let corruptionNote = '';

    // Check if clause number contains commas (potential corruption)
    if (!fixed.includes(',')) {
      return { fixed, hasCorruption: false, isAmbiguous: false, corruptionNote: '' };
    }

    // Rule A: Simple continuation (\d+\.\d+),(\d+) → \d+\.\d+\.\d+
    // Pattern: A.B,C → A.B.C (where C is a single number, not followed by dot)
    // Example: 4.4,2 → 4.4.2
    fixed = fixed.replace(/(\d+\.\d+),(\d+)(?!\.)/g, (match) => {
      hasCorruption = true;
      return match.replace(',', '.');
    });

    // Rule B: Deeper continuation (\d+\.\d+),(\d+\.\d+) → \d+\.\d+\.\d+\.\d+
    // Apply if right side has multiple segments (indicating continuation)
    // Example: 8.3,1.3.3 → 8.3.1.3.3 (right has multiple segments, safe to fix)
    fixed = fixed.replace(/(\d+(?:\.\d+)+),(\d+\.\d+)/g, (match, left, right) => {
      const leftParts = left.split('.');
      const rightParts = right.split('.');
      const leftLastSegment = parseInt(leftParts[leftParts.length - 1], 10);
      const rightFirstSegment = parseInt(rightParts[0], 10);

      // If right has multiple segments (e.g., 1.3.3), it's likely continuation
      // OR if right starts with same number as left's last segment
      if (rightParts.length > 1 || rightFirstSegment === leftLastSegment) {
        hasCorruption = true;
        return `${left}.${right}`;
      }

      return match; // Don't fix if unclear
    });

    // Rule C: Check for ambiguous cases (DO NOT GUESS)
    // Pattern: A.B.C.D,E.F.G where both have multiple segments and E != D
    // Example: 2.4.3.2,2.7.3 (could be 2.4.3.2.2.7.3 OR two separate clauses)
    const ambiguousPattern = /(\d+(?:\.\d+){2,}),(\d+(?:\.\d+){2,})/g;
    const ambiguousMatches = [...fixed.matchAll(ambiguousPattern)];

    for (const match of ambiguousMatches) {
      const left = match[1];
      const right = match[2];
      const leftParts = left.split('.');
      const rightParts = right.split('.');
      const leftLast = parseInt(leftParts[leftParts.length - 1], 10);
      const rightFirst = parseInt(rightParts[0], 10);

      // Ambiguous if: both have 2+ segments AND right doesn't start with left's last segment
      // AND both sides are substantial (not just 2 segments each)
      if (leftLast !== rightFirst && leftParts.length >= 3 && rightParts.length >= 2) {
        isAmbiguous = true;
        corruptionNote = `POSSIBLE OCR CLAUSE CORRUPTION: ${match[0]}`;
        // Don't fix - leave as-is for manual review
      }
    }

    return { fixed, hasCorruption, isAmbiguous, corruptionNote };
  }

  /**
   * Normalize clause number
   */
  function normalizeClauseNumber(clauseNumber: string): {
    normalized: string;
    corruptionNote: string;
  } {
    let normalized = clauseNumber
      .trim()
      .replace(/^Clause\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Fix comma corruption
    const { fixed, hasCorruption, isAmbiguous, corruptionNote } = fixCommaCorruption(normalized);
    normalized = fixed;

    return {
      normalized,
      corruptionNote: hasCorruption || isAmbiguous ? corruptionNote : '',
    };
  }

  /**
   * Extract heading from clause text
   */
  function extractHeading(clauseText: string, clauseNumber: string): { heading: string; body: string } {
    if (!clauseText || !clauseText.trim()) {
      return { heading: '', body: '' };
    }

    const text = clauseText.trim();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if (lines.length === 0) {
      return { heading: '', body: text };
    }

    const firstLine = lines[0];

    // Check if first line matches pattern like "2.6 CONTROLS AND INDICATORS"
    const patternMatch = firstLine.match(new RegExp(`^${clauseNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(.+)$`, 'i'));
    if (patternMatch && patternMatch[1]) {
      const heading = patternMatch[1].trim();
      if (heading.length <= 120) {
        const body = lines.slice(1).join('\n').trim();
        return { heading, body: body || text };
      }
    }

    // Check if first line is ALL CAPS or Title Case and short
    const isAllCaps = firstLine === firstLine.toUpperCase() && firstLine.length > 0;
    const isTitleCase = /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(firstLine);

    if ((isAllCaps || isTitleCase) && firstLine.length <= 120) {
      const body = lines.slice(1).join('\n').trim();
      return { heading: firstLine, body: body || text };
    }

    // No heading extracted
    return { heading: '', body: text };
  }

  /**
   * Calculate hierarchy from clause number
   */
  function calculateHierarchy(clauseNumber: string): {
    level: number;
    parent_number: string;
    clause_number_clean: string;
  } {
    // Remove trailing (a), (b), etc. for parent calculation
    const clause_number_clean = clauseNumber.replace(/\s*\([a-zivx]+\)\s*$/i, '').trim();

    // Count depth by counting dots
    const parts = clause_number_clean.split('.').filter(p => p.length > 0);
    const level = parts.length;

    // Calculate parent
    let parent_number = '';
    if (parts.length > 1) {
      parent_number = parts.slice(0, -1).join('.');
    }

    return { level, parent_number, clause_number_clean };
  }

  /**
   * Check if clause is appendix
   */
  function isAppendix(clauseNumber: string): boolean {
    // Match patterns like A, A.1, B.2, etc.
    return /^[A-Z](?:\.\d+|\d+|$)/.test(clauseNumber.trim());
  }

  /**
   * Transform Excel data to CSV structure
   */
  function transformToCSV(excelRows: ExcelRow[], standard: string): CSVRow[] {
    const csvRows: CSVRow[] = [];
    const clauseNumberMap = new Map<string, number>(); // Track duplicates

    excelRows.forEach((row, index) => {
      const clauseNumberRaw = row['Clause Number'] || '';
      const { normalized: clauseNumber, corruptionNote } = normalizeClauseNumber(clauseNumberRaw);

      if (!clauseNumber) {
        return; // Skip rows without clause number
      }

      // Handle duplicates
      const existingCount = clauseNumberMap.get(clauseNumber) || 0;
      clauseNumberMap.set(clauseNumber, existingCount + 1);

      let id = `${standard}:${clauseNumber}`;
      let had_duplicate_merge = false;

      if (existingCount > 0) {
        // Duplicate found - for now, suffix with #2, #3, etc.
        // In a more sophisticated version, you might merge them
        id = `${standard}:${clauseNumber}#${existingCount + 1}`;
      }

      // Extract heading and body
      const clauseText = row['Clause Text'] || '';
      const { heading, body } = extractHeading(clauseText, clauseNumber);

      // Calculate hierarchy
      const { level, parent_number } = calculateHierarchy(clauseNumber);
      const parent_id = parent_number ? `${standard}:${parent_number}` : '';

      // Combine notes, warnings, and jurisdiction
      let notes = row['Notes'] || '';
      const warnings = row['Warnings'] || '';
      const jurisdiction = row['Jurisdiction'] || '';

      const noteParts: string[] = [];
      if (notes) noteParts.push(notes);
      if (warnings) noteParts.push(`WARNING: ${warnings}`);
      if (jurisdiction) noteParts.push(`JURISDICTION: ${jurisdiction}`);

      // Add corruption note if detected
      if (corruptionNote) {
        noteParts.push(corruptionNote);
      }

      notes = noteParts.join('\n\n');

      // Determine flags
      const appendix_flag = isAppendix(clauseNumber);
      const embeddable = true; // Default to true
      const is_heading_only = !body || body.trim().length === 0;

      // Source rows (JSON array)
      const source_rows = `[${index}]`;

      csvRows.push({
        id,
        clause_number: clauseNumber,
        heading,
        body,
        notes,
        exceptions: row['Exceptions'] || '',
        level,
        parent_number,
        parent_id,
        appendix_flag,
        embeddable,
        is_heading_only,
        had_duplicate_merge,
        source_rows,
      });
    });

    return csvRows;
  }

  /**
   * Handle Excel file upload
   */
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if it's an Excel file
    const isExcelFile = file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel';

    if (!isExcelFile) {
      setError('Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setExcelData(null);
    setCsvData(null);

    try {
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();

      // Parse Excel file
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      // Find "Clauses" sheet
      const clausesSheet = workbook.Sheets['Clauses'];

      if (!clausesSheet) {
        throw new Error('Could not find "Clauses" sheet in the Excel file. Please ensure the file was exported from the word processor.');
      }

      // Convert sheet to JSON
      const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(clausesSheet, { defval: '' });

      if (jsonData.length === 0) {
        throw new Error('The "Clauses" sheet is empty.');
      }

      setExcelData(jsonData);

      // Transform to CSV structure
      const transformed = transformToCSV(jsonData, standardPrefix);
      setCsvData(transformed);

      setSuccess(`Successfully loaded ${jsonData.length} clause(s) from Excel file. Transformed to ${transformed.length} CSV row(s).`);
    } catch (err: any) {
      setError(err.message || 'Failed to process Excel file');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Export to CSV
   */
  const exportToCSV = () => {
    if (!csvData || csvData.length === 0) {
      setError('No data to export. Please upload an Excel file first.');
      return;
    }

    if (!standardPrefix.trim()) {
      setError('Please enter a standard prefix (e.g., as3000, as3003)');
      return;
    }

    try {
      // Re-transform with current standard prefix if it changed
      const finalData = excelData ? transformToCSV(excelData, standardPrefix.trim()) : csvData;

      // CSV headers in correct order
      const headers = [
        'id',
        'clause_number',
        'heading',
        'body',
        'notes',
        'exceptions',
        'level',
        'parent_number',
        'parent_id',
        'appendix_flag',
        'embeddable',
        'is_heading_only',
        'had_duplicate_merge',
        'source_rows',
      ];

      // Build CSV content
      const csvRows: string[] = [];

      // Header row
      csvRows.push(headers.join(','));

      // Data rows
      finalData.forEach((row) => {
        const values = headers.map(header => {
          const value = row[header as keyof CSVRow];

          // Format boolean values
          if (typeof value === 'boolean') {
            return value ? 'True' : 'False';
          }

          const str = value !== null && value !== undefined ? String(value) : '';

          // Escape values that contain comma, quote, or newline
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        });
        csvRows.push(values.join(','));
      });

      // Create CSV content
      const csvContent = csvRows.join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', 'clauses_cleaned.csv');
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSuccess(`Successfully exported ${finalData.length} clause(s) to clauses_cleaned.csv`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (error: any) {
      setError(`Export failed: ${error.message || 'Unknown error'}`);
    }
  };

  // Re-transform when standard prefix changes
  const handleStandardPrefixChange = (value: string) => {
    setStandardPrefix(value);
    if (excelData) {
      const transformed = transformToCSV(excelData, value.trim() || 'as3000');
      setCsvData(transformed);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Standard Prefix Input */}
      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Standard Prefix
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Enter the standard prefix for clause IDs (e.g., as3000, as3003). This will be used to generate IDs like <code>as3000:1.1</code>.
        </Typography>
        <TextField
          label="Standard Prefix"
          value={standardPrefix}
          onChange={(e) => handleStandardPrefixChange(e.target.value)}
          placeholder="as3000"
          fullWidth
          sx={{ maxWidth: 300 }}
        />
      </Paper>

      {/* Upload Section */}
      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Step 1: Upload Excel File
        </Typography>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />

        <Button
          variant="contained"
          startIcon={<UploadIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          sx={{ mb: 2 }}
        >
          Upload Excel File
        </Button>

        {loading && (
          <Box display="flex" alignItems="center" gap={2} mt={2}>
            <CircularProgress size={20} />
            <Typography variant="body2">Processing Excel file...</Typography>
          </Box>
        )}
      </Paper>

      {/* Messages */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Export Section */}
      {csvData && csvData.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Step 2: Export to CSV
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Found {excelData?.length || 0} clause(s) in the Excel file.
            Transformed to {csvData.length} CSV row(s) with database structure.
            Click the button below to export as <code>clauses_cleaned.csv</code>.
          </Typography>

          <Button
            variant="contained"
            color="primary"
            startIcon={<ExportIcon />}
            onClick={exportToCSV}
            size="large"
          >
            Export to clauses_cleaned.csv
          </Button>

          {/* Preview */}
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Preview (first 3 rows, key fields):
            </Typography>
            <Box
              sx={{
                mt: 1,
                p: 2,
                bgcolor: 'grey.100',
                borderRadius: 1,
                maxHeight: 400,
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #ccc', fontWeight: 'bold' }}>id</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #ccc', fontWeight: 'bold' }}>clause_number</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #ccc', fontWeight: 'bold' }}>heading</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #ccc', fontWeight: 'bold' }}>level</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #ccc', fontWeight: 'bold' }}>parent_id</th>
                  </tr>
                </thead>
                <tbody>
                  {csvData.slice(0, 3).map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>{row.id}</td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>{row.clause_number}</td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.heading}>
                        {row.heading.substring(0, 30)}{row.heading.length > 30 ? '...' : ''}
                      </td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>{row.level}</td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>{row.parent_id || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvData.length > 3 && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  ... and {csvData.length - 3} more row(s)
                </Typography>
              )}
            </Box>
          </Box>
        </Paper>
      )}

      {/* Instructions */}
      {!excelData && !loading && (
        <Paper sx={{ p: 3, bgcolor: 'info.light', color: 'info.contrastText' }}>
          <Typography variant="h6" gutterBottom>
            Instructions
          </Typography>
          <Typography variant="body2" component="div">
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              <li>Enter the standard prefix (e.g., as3000, as3003)</li>
              <li>Export clauses from the Word Processor to Excel</li>
              <li>Review and fine-tune the Excel file as needed</li>
              <li>Upload the fine-tuned Excel file here</li>
              <li>Export to <code>clauses_cleaned.csv</code> for database upload</li>
            </ol>
          </Typography>
        </Paper>
      )}
    </Container>
  );
}


