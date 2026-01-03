/**
 * API Endpoint: POST /api/process-ncc-to-excel
 * 
 * Converts NCC DOCX files to Excel with minimal columns
 * Focus: Don't miss any text content
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import mammoth from 'mammoth';
import formidable, { File as FormidableFile } from 'formidable';
import fs from 'fs';
import * as XLSX from 'xlsx';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: '50mb',
  },
};

import { getDisciplineForClause } from '@/lib/ncc-discipline-mapper';

interface ExcelRow {
  volume: string;
  row_type: 'paragraph' | 'table_cell';
  heading_level: string; // H1, H2, H3, H4, or blank
  heading_text: string;
  unit_type: 'PERFORMANCE_REQUIREMENT' | 'DTS_PROVISION' | 'VERIFICATION_METHOD' | 'EVIDENCE_OF_SUITABILITY' | 'DEFINITION' | 'OTHER';
  clause_ref: string;
  text: string;
  source_location: string;
  ncc_topic_discipline: string; // Discipline mapping from YAML (e.g., "DisabilityAccess", "Fire")
}

type ErrorResponse = {
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ excelBuffer: Buffer; filename: string; stats: any } | ErrorResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse multipart form data
    const form = formidable({
      maxFileSize: 20 * 1024 * 1024, // 20MB
      keepExtensions: true,
    });

    const [fields, files] = await new Promise<[formidable.Fields, formidable.Files]>(
      (resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          else resolve([fields, files]);
        });
      }
    );

    const fileArray = files.file as FormidableFile[];
    const file = fileArray?.[0];
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const volume = Array.isArray(fields.volume) ? fields.volume[0] : fields.volume || 'Vol1';
    const normalizedVolume = volume.replace(/^Vol/i, '').toUpperCase();
    const volumeLabel = `Vol${normalizedVolume}`;
    
    // Get format (excel or csv), default to excel
    const format = Array.isArray(fields.format) ? fields.format[0] : fields.format || 'excel';

    // Validate file type
    if (!file.originalFilename?.endsWith('.docx')) {
      return res.status(400).json({ error: 'Only .docx files are supported' });
    }

    console.log(`[NCC Excel] Processing: ${file.originalFilename} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`[NCC Excel] Volume: ${volumeLabel}`);

    // Read file buffer
    const buffer = fs.readFileSync(file.filepath);

    // Convert DOCX to HTML using Mammoth
    console.log('[NCC Excel] Converting DOCX to HTML...');
    const mammothResult = await mammoth.convertToHtml(
      { buffer },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Heading 5'] => h5:fresh",
          "p[style-name='Heading 6'] => h6:fresh",
        ],
      }
    );

    const html = mammothResult.value;
    
    // Log table count in HTML for debugging
    const tableCountInHtml = (html.match(/<table/gi) || []).length;
    const paragraphCountInHtml = (html.match(/<p[^>]*>/gi) || []).length;
    console.log(`[NCC Excel] Found ${tableCountInHtml} <table> tags and ${paragraphCountInHtml} <p> tags in HTML`);
    
    // Parse HTML to extract paragraphs and tables
    // Mammoth outputs HTML fragments, so wrap in a proper HTML structure for linkedom
    const { DOMParser } = await import('linkedom');
    const wrappedHtml = `<!DOCTYPE html><html><head><title></title></head><body>${html}</body></html>`;
    const dom = new DOMParser().parseFromString(wrappedHtml, 'text/html');
    
    const rows: ExcelRow[] = [];
    let paragraphIndex = 0;
    let tableIndex = 0;

    // Extract all content in document order: paragraphs, headings, AND tables
    // Mammoth outputs HTML that might not have a body tag, so check documentElement
    const root = dom.querySelector('body') || dom.documentElement;
    const allContent: Array<{ type: 'paragraph' | 'table'; element: Element; index: number }> = [];
    
    // Get all block elements and tables in document order
    // Try multiple selectors to catch all possible elements
    let allParagraphs: Element[] = [];
    let allTables: Element[] = [];
    
    // Try querySelectorAll on root
    try {
      allParagraphs = Array.from(root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, li, blockquote'));
      allTables = Array.from(root.querySelectorAll('table'));
    } catch (e) {
      console.warn(`[NCC Excel] querySelectorAll failed, trying alternative method:`, e);
      // Fallback: try on documentElement directly
      allParagraphs = Array.from(dom.documentElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, li, blockquote'));
      allTables = Array.from(dom.documentElement.querySelectorAll('table'));
    }
    
    console.log(`[NCC Excel] querySelectorAll found ${allParagraphs.length} paragraphs and ${allTables.length} tables`);
    
    // If still no elements, try a different approach - parse the HTML string directly
    if (allParagraphs.length === 0 && allTables.length === 0) {
      console.warn(`[NCC Excel] No elements found with querySelectorAll, trying regex-based extraction`);
      // This is a fallback - we'll need to process differently
      // For now, let's check if the HTML structure is different
      const htmlPreview = html.substring(0, 500);
      console.log(`[NCC Excel] HTML preview (first 500 chars): ${htmlPreview}`);
    }
    
    // Combine and sort by document position
    const allElementsWithType: Array<{ type: 'paragraph' | 'table'; element: Element }> = [];
    
    // Add paragraphs (skip if inside a table)
    for (const el of allParagraphs) {
      // Check if element is inside a table (closest might not work in linkedom)
      let isInsideTable = false;
      let parent: Element | null = el.parentElement;
      while (parent) {
        const tagName = parent.tagName ? parent.tagName.toLowerCase() : '';
        if (tagName === 'table') {
          isInsideTable = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!isInsideTable) {
        allElementsWithType.push({ type: 'paragraph', element: el });
      }
    }
    
    // Add tables
    for (const el of allTables) {
      allElementsWithType.push({ type: 'table', element: el });
    }
    
    // Assign indices
    for (let i = 0; i < allElementsWithType.length; i++) {
      allContent.push({ ...allElementsWithType[i], index: i });
    }
    
    console.log(`[NCC Excel] Found ${allContent.length} content elements (${allContent.filter(c => c.type === 'paragraph').length} paragraphs + ${allContent.filter(c => c.type === 'table').length} tables) in document order`);
    
    // First pass: identify clause boundaries from paragraphs
    const clauseBoundaries: Array<{ index: number; clauseRef: string; element: Element }> = [];
    
    for (let i = 0; i < allContent.length; i++) {
      const item = allContent[i];
      if (item.type === 'paragraph') {
        const text = item.element.textContent?.trim() || '';
        if (!text) continue;
        
        const clauseRef = extractClauseRef(text);
        if (clauseRef) {
          clauseBoundaries.push({ index: i, clauseRef, element: item.element });
          if (clauseBoundaries.length <= 5) {
            console.log(`[NCC Excel] Found clause ${clauseRef} at index ${i}: "${text.substring(0, 100)}"`);
          }
        }
      }
    }
    
    console.log(`[NCC Excel] Found ${clauseBoundaries.length} clause boundaries`);
    
    if (clauseBoundaries.length === 0) {
      console.warn(`[NCC Excel] WARNING: No clauses detected! First 10 paragraph texts:`);
      let paraCount = 0;
      for (let i = 0; i < allContent.length && paraCount < 10; i++) {
        if (allContent[i].type === 'paragraph') {
          const text = allContent[i].element.textContent?.trim() || '';
          if (text) {
            console.warn(`  [${i}] "${text.substring(0, 150)}"`);
            paraCount++;
          }
        }
      }
    }
    
    // Second pass: aggregate all content (paragraphs AND tables) by clause
    for (let i = 0; i < clauseBoundaries.length; i++) {
      const { index: startIndex, clauseRef, element: startElement } = clauseBoundaries[i];
      const endIndex = i < clauseBoundaries.length - 1 
        ? clauseBoundaries[i + 1].index 
        : allContent.length;
      
      // Collect all content for this clause (paragraphs and tables)
      const clauseContent: string[] = [];
      let clauseHeadingText = '';
      let clauseHeadingLevel = '';
      
      for (let j = startIndex; j < endIndex; j++) {
        const item = allContent[j];
        
        if (item.type === 'paragraph') {
          const text = item.element.textContent?.trim() || '';
          if (!text) continue;
          
          // Skip if this paragraph is actually the next clause (safety check)
          if (j > startIndex) {
            const nextClauseRef = extractClauseRef(text);
            if (nextClauseRef && nextClauseRef !== clauseRef) {
              // This is the start of the next clause, stop here
              break;
            }
          }
          
          clauseContent.push(text);
          
          // Extract heading from the first paragraph (clause heading)
          if (j === startIndex) {
            const tagName = item.element.tagName.toLowerCase();
            
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
              clauseHeadingLevel = tagName.toUpperCase();
            }
            
            // Extract heading text (text after clause reference)
            const textAfterRef = text.replace(new RegExp(`^${clauseRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[–—:.-]?\\s*`), '').trim();
            if (textAfterRef) {
              // Take first sentence or first 100 chars
              const sentenceMatch = textAfterRef.match(/^([^.!?]+[.!?])(?:\s|$)/);
              if (sentenceMatch && sentenceMatch[1].trim().length <= 150) {
                clauseHeadingText = sentenceMatch[1].trim();
              } else {
                const firstLine = textAfterRef.split(/\n/)[0].trim();
                clauseHeadingText = firstLine.length <= 100 ? firstLine : firstLine.substring(0, 100);
              }
            }
          }
        } else if (item.type === 'table') {
          // Check if this table has its own clause ref (if so, it's separate - skip it here)
          const table = item.element as HTMLTableElement;
          const tableRows = table.querySelectorAll('tr');
          let tableHasOwnClauseRef = false;
          let tableClauseRef = '';
          
          for (let rIdx = 0; rIdx < Math.min(3, tableRows.length); rIdx++) {
            const row = tableRows[rIdx];
            const cells = row.querySelectorAll('td, th');
            for (let cIdx = 0; cIdx < Math.min(3, cells.length); cIdx++) {
              const cell = cells[cIdx];
              const text = cell.textContent?.trim() || '';
              const ref = extractClauseRef(text);
              if (ref && ref !== clauseRef) {
                // This table has a different clause ref, it's a separate clause
                tableHasOwnClauseRef = true;
                tableClauseRef = ref;
                break;
              }
            }
            if (tableHasOwnClauseRef) break;
          }
          
          if (!tableHasOwnClauseRef) {
            // This table belongs to the current clause, include it in the clause text
            const formattedTable = formatTableForRAG(table, '', -1);
            clauseContent.push(`\n\n[TABLE]\n${formattedTable}\n[/TABLE]`);
          }
          // If table has its own clause ref, it will be processed separately in the table extraction pass
        }
      }
      
      // Combine all content into full clause text
      let fullClauseText = clauseContent.join('\n\n');
      
      // Only add row if we have content
      if (fullClauseText.trim().length === 0) {
        console.warn(`[NCC Excel] Warning: Clause ${clauseRef} has no content, skipping`);
        continue;
      }
      
      // Excel cell limit is 32,767 characters - truncate if necessary
      const EXCEL_CELL_LIMIT = 32767;
      let truncated = false;
      const originalLength = fullClauseText.length;
      if (fullClauseText.length > EXCEL_CELL_LIMIT) {
        fullClauseText = fullClauseText.substring(0, EXCEL_CELL_LIMIT - 3) + '...';
        truncated = true;
        console.warn(`[NCC Excel] Clause ${clauseRef} text truncated (${originalLength} chars -> ${EXCEL_CELL_LIMIT})`);
      }
      
      // Classify unit type based on full clause text
      const unitType = classifyUnitType(fullClauseText);
      
      // Get discipline mapping from YAML (filter by volume)
      const nccTopicDiscipline = getDisciplineForClause(clauseRef, volumeLabel);
      
      rows.push({
        volume: volumeLabel,
        row_type: 'paragraph',
        heading_level: clauseHeadingLevel,
        heading_text: clauseHeadingText,
        unit_type: unitType,
        clause_ref: clauseRef,
        text: fullClauseText,
        source_location: `para_${startIndex}_to_${endIndex - 1}${truncated ? '_truncated' : ''}`,
        ncc_topic_discipline: nccTopicDiscipline,
      });
      
      if (rows.length <= 5) {
        console.log(`[NCC Excel] Added clause row ${rows.length}: ${clauseRef} (${fullClauseText.length} chars, ${clauseContent.length} content items)`);
      }
    }
    
    console.log(`[NCC Excel] Created ${rows.length} clause rows from ${clauseBoundaries.length} clause boundaries`);
    
    // Third pass: add content that comes before any clause (introductory content)
    // and any remaining content that wasn't captured
    const processedIndices = new Set<number>();
    
    // Mark all indices that were processed in clause aggregation
    for (let j = 0; j < clauseBoundaries.length; j++) {
      const startIdx = clauseBoundaries[j].index;
      const endIdx = j < clauseBoundaries.length - 1 
        ? clauseBoundaries[j + 1].index 
        : allContent.length;
      for (let k = startIdx; k < endIdx; k++) {
        processedIndices.add(k);
      }
    }
    
    // Process any remaining unprocessed content
    for (let i = 0; i < allContent.length; i++) {
      if (processedIndices.has(i)) continue;
      
      const item = allContent[i];
      const otherContent: string[] = [];
      
      if (item.type === 'paragraph') {
        const text = item.element.textContent?.trim() || '';
        if (!text) continue;
        
        // Collect following unprocessed content until we hit a processed one or clause
        otherContent.push(text);
        for (let j = i + 1; j < allContent.length; j++) {
          if (processedIndices.has(j)) break;
          
          const nextItem = allContent[j];
          if (nextItem.type === 'paragraph') {
            const nextText = nextItem.element.textContent?.trim() || '';
            if (!nextText) continue;
            
            // Check if next paragraph is a new clause
            if (extractClauseRef(nextText)) break;
            
            otherContent.push(nextText);
            processedIndices.add(j);
          } else if (nextItem.type === 'table') {
            // Include tables in the content
            const table = nextItem.element as HTMLTableElement;
            const formattedTable = formatTableForRAG(table, '', -1);
            otherContent.push(`\n\n[TABLE]\n${formattedTable}\n[/TABLE]`);
            processedIndices.add(j);
          }
        }
      } else if (item.type === 'table') {
        // Standalone table without clause ref
        const table = item.element as HTMLTableElement;
        const formattedTable = formatTableForRAG(table, '', -1);
        otherContent.push(`[TABLE]\n${formattedTable}\n[/TABLE]`);
      }
      
      if (otherContent.length === 0) continue;
      
      let combinedText = otherContent.join('\n\n');
      
      // Excel cell limit is 32,767 characters - truncate if necessary
      const EXCEL_CELL_LIMIT = 32767;
      let truncated = false;
      if (combinedText.length > EXCEL_CELL_LIMIT) {
        combinedText = combinedText.substring(0, EXCEL_CELL_LIMIT - 3) + '...';
        truncated = true;
        console.warn(`[NCC Excel] Non-clause content text truncated (${otherContent.join('\n\n').length} chars -> ${EXCEL_CELL_LIMIT})`);
      }
      
      const unitType = classifyUnitType(combinedText);
      
      // Get discipline mapping (empty clause_ref means no discipline)
      const nccTopicDiscipline = '';
      
      rows.push({
        volume: volumeLabel,
        row_type: item.type === 'table' ? 'table_cell' : 'paragraph',
        heading_level: '',
        heading_text: '',
        unit_type: unitType,
        clause_ref: '',
        text: combinedText,
        source_location: `content_${i}_to_${i + otherContent.length - 1}${truncated ? '_truncated' : ''}`,
        ncc_topic_discipline: nccTopicDiscipline,
      });
      
      processedIndices.add(i);
      // Skip the content we just processed
      i += otherContent.length - 1;
    }
    
    // Final validation: log any unprocessed content (should be none)
    const unprocessedCount = allContent.length - processedIndices.size;
    if (unprocessedCount > 0) {
      console.warn(`[NCC Excel] Warning: ${unprocessedCount} content elements were not processed`);
    }
    
    // Log summary before table processing
    const clauseRowCount = rows.filter(r => r.clause_ref && !r.clause_ref.startsWith('table')).length;
    console.log(`[NCC Excel] Summary before table processing: ${clauseRowCount} clause rows, ${rows.length - clauseRowCount} other rows`);

    // Fourth pass: Extract ALL tables as separate rows
    // This ensures no tables are missed, even if they're also included in clause text
    const tables = dom.querySelectorAll('table');
    console.log(`[NCC Excel] Found ${tables.length} tables in DOM`);
    
    if (tables.length === 0 && tableCountInHtml > 0) {
      console.warn(`[NCC Excel] Warning: Found ${tableCountInHtml} <table> tags in HTML but ${tables.length} tables in DOM - tables may not be parsed correctly`);
    }
    
    // Extract ALL tables - don't skip any
    for (let tIdx = 0; tIdx < tables.length; tIdx++) {
      const table = tables[tIdx];
      
      const tableRows = table.querySelectorAll('tr');
      
      // Check if table has a clause reference in any cell (especially first row/first cell)
      // Look for patterns like H2V1a, H2V1b which are separate table clauses
      let tableClauseRef = '';
      let tableHasClauseRef = false;
      let clauseRefRowIndex = -1;
      let clauseRefCellIndex = -1;
      
      // Check all rows and cells for clause references (not just first few)
      for (let rIdx = 0; rIdx < tableRows.length; rIdx++) {
        const row = tableRows[rIdx];
        const cells = row.querySelectorAll('td, th');
        for (let cIdx = 0; cIdx < cells.length; cIdx++) {
          const cell = cells[cIdx];
          const text = cell.textContent?.trim() || '';
          const ref = extractClauseRef(text);
          if (ref) {
            // Add "table " prefix to all table clause refs
            tableClauseRef = `table ${ref}`;
            tableHasClauseRef = true;
            clauseRefRowIndex = rIdx;
            clauseRefCellIndex = cIdx;
            break;
          }
        }
        if (tableHasClauseRef) break;
      }
      
      // Log table detection for debugging
      if (tableRows.length > 0) {
        console.log(`[NCC Excel] Table ${tableIndex}: ${tableRows.length} rows, hasClauseRef: ${tableHasClauseRef}, clauseRef: ${tableClauseRef || 'none'}`);
      }
      
      // Convert table to RAG-friendly format (markdown-style)
      const formattedTable = formatTableForRAG(table, tableClauseRef, clauseRefRowIndex);
      
      // All tables should be included, with or without clause refs
      // If table has its own clause ref (like H2V1b), it's a separate clause - don't mix with parent
      if (tableHasClauseRef) {
        // Extract heading text from the clause ref cell
        // Note: tableClauseRef already has "table " prefix
        const baseClauseRef = tableClauseRef.replace(/^table\s+/i, ''); // Remove prefix for text extraction
        let tableHeadingText = '';
        if (clauseRefRowIndex >= 0 && clauseRefCellIndex >= 0) {
          const clauseRow = tableRows[clauseRefRowIndex];
          const cells = clauseRow.querySelectorAll('td, th');
          if (cells[clauseRefCellIndex]) {
            const cell = cells[clauseRefCellIndex];
            const text = cell.textContent?.trim() || '';
            // Extract text after clause ref (use base ref without "table " prefix)
            const textAfterRef = text.replace(new RegExp(`^${baseClauseRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[–—:.-]?\\s*`), '').trim();
            if (textAfterRef) {
              const sentenceMatch = textAfterRef.match(/^([^.!?]+[.!?])(?:\s|$)/);
              if (sentenceMatch && sentenceMatch[1].trim().length <= 150) {
                tableHeadingText = sentenceMatch[1].trim();
              } else {
                const firstLine = textAfterRef.split(/\n/)[0].trim();
                tableHeadingText = firstLine.length <= 100 ? firstLine : firstLine.substring(0, 100);
              }
            }
          }
        }
        
        const unitType = classifyUnitType(formattedTable);
        
        // Excel cell limit check
        let tableText = formattedTable;
        const EXCEL_CELL_LIMIT = 32767;
        let truncated = false;
        if (tableText.length > EXCEL_CELL_LIMIT) {
          tableText = tableText.substring(0, EXCEL_CELL_LIMIT - 3) + '...';
          truncated = true;
          console.warn(`[NCC Excel] Table ${tableIndex} (${tableClauseRef}) text truncated`);
        }
        
        // Get discipline mapping from YAML (use baseClauseRef without "table " prefix, filter by volume)
        const nccTopicDiscipline = getDisciplineForClause(baseClauseRef, volumeLabel);
        
        rows.push({
          volume: volumeLabel,
          row_type: 'table_cell',
          heading_level: '',
          heading_text: tableHeadingText,
          unit_type: unitType,
          clause_ref: tableClauseRef, // Already has "table " prefix
          text: tableText,
          source_location: `table_${tableIndex}_${baseClauseRef}${truncated ? '_truncated' : ''}`,
          ncc_topic_discipline: nccTopicDiscipline,
        });
      } else {
        // Table without clause ref - still format as RAG table, use "table" as clause_ref
        let tableText = formattedTable;
        const EXCEL_CELL_LIMIT = 32767;
        let truncated = false;
        if (tableText.length > EXCEL_CELL_LIMIT) {
          tableText = tableText.substring(0, EXCEL_CELL_LIMIT - 3) + '...';
          truncated = true;
        }
        
        const unitType = classifyUnitType(tableText);
        
        // No discipline mapping for tables without clause refs
        const nccTopicDiscipline = '';
        
        rows.push({
          volume: volumeLabel,
          row_type: 'table_cell',
          heading_level: '',
          heading_text: '',
          unit_type: unitType,
          clause_ref: `table ${tableIndex}`, // Use "table" prefix even without clause ref
          text: tableText,
          source_location: `table_${tableIndex}${truncated ? '_truncated' : ''}`,
          ncc_topic_discipline: nccTopicDiscipline,
        });
      }
      
      tableIndex++;
    }
    
    // Log final summary
    const finalTableRows = rows.filter(r => r.row_type === 'table_cell').length;
    const finalClauseRows = rows.filter(r => r.clause_ref && !r.clause_ref.startsWith('table')).length;
    console.log(`[NCC Excel] Final summary: ${finalClauseRows} clause rows, ${finalTableRows} table rows, ${rows.length} total rows`);

    // Final validation: Ensure all text fields are within Excel's 32,767 character limit
    const EXCEL_CELL_LIMIT = 32767;
    let truncationCount = 0;
    
    for (const row of rows) {
      // Truncate text field if needed
      if (row.text && row.text.length > EXCEL_CELL_LIMIT) {
        row.text = row.text.substring(0, EXCEL_CELL_LIMIT - 3) + '...';
        truncationCount++;
      }
      // Truncate heading_text if needed
      if (row.heading_text && row.heading_text.length > EXCEL_CELL_LIMIT) {
        row.heading_text = row.heading_text.substring(0, EXCEL_CELL_LIMIT - 3) + '...';
      }
      // Truncate clause_ref if needed (shouldn't happen, but safety check)
      if (row.clause_ref && row.clause_ref.length > EXCEL_CELL_LIMIT) {
        row.clause_ref = row.clause_ref.substring(0, EXCEL_CELL_LIMIT - 3) + '...';
      }
    }
    
    if (truncationCount > 0) {
      console.warn(`[NCC Excel] ${truncationCount} row(s) had text truncated to fit Excel's 32,767 character limit`);
    }

    // Validation: Check that we didn't miss any content
    const paragraphCount = rows.filter(r => r.row_type === 'paragraph').length;
    const tableCellCount = rows.filter(r => r.row_type === 'table_cell').length;
    const totalRows = rows.length;

    console.log(`[NCC Excel] Extracted: ${paragraphCount} paragraphs, ${tableCellCount} table cells, ${totalRows} total rows`);

    // Cleanup temp file
    try {
      fs.unlinkSync(file.filepath);
    } catch (err) {
      console.warn('[NCC Excel] Failed to delete temp file:', err);
    }

    if (format === 'csv') {
      // Generate CSV with all fillable columns
      const csvRows = convertToCSVFormat(rows, volumeLabel, file.originalFilename || 'unknown.docx');
      const csvContent = generateCSV(csvRows);
      const csvBuffer = Buffer.from(csvContent, 'utf-8');
      const filename = `ncc_${volumeLabel.toLowerCase()}_${Date.now()}.csv`;
      
      console.log(`[NCC CSV] ✅ Success: ${totalRows} rows exported to ${filename}`);
      
      return res.status(200).json({
        csvBuffer: csvBuffer.toString('base64'),
        filename,
        format: 'csv',
        stats: {
          paragraphs: paragraphCount,
          tableCells: tableCellCount,
          totalRows,
        },
      });
    } else {
      // Create Excel workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'ncc_units');

      // Convert to buffer
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      // Generate filename
      const filename = `ncc_${volumeLabel.toLowerCase()}_${Date.now()}.xlsx`;

      console.log(`[NCC Excel] ✅ Success: ${totalRows} rows exported to ${filename}`);

      // Return Excel file as base64 encoded string for JSON response
      const base64Buffer = excelBuffer.toString('base64');
      
      return res.status(200).json({
        excelBuffer: base64Buffer,
        filename,
        format: 'excel',
        stats: {
          paragraphs: paragraphCount,
          tableCells: tableCellCount,
          totalRows,
        },
      });
    }

  } catch (error: any) {
    console.error('[NCC Excel] Error:', error.message);
    console.error(error.stack);
    
    return res.status(500).json({
      error: error.message || 'An error occurred during processing',
    });
  }
}

/**
 * Convert Excel rows to CSV format with all fillable columns
 */
interface CSVRow {
  [key: string]: string | number | boolean;
}

function convertToCSVFormat(rows: ExcelRow[], volumeLabel: string, sourceFile: string): CSVRow[] {
  const csvRows: CSVRow[] = [];
  
  // Extract section_code and part_code from clause_ref
  // NCC Structure: C1F1 -> section_code: "C", part_code: "C1", unit_label: "C1F1"
  // NCC Structure: D2D1 -> section_code: "D", part_code: "D2", unit_label: "D2D1"
  // NCC Structure: A5G1 -> section_code: "A", part_code: "A5", unit_label: "A5G1"
  // NCC Structure: P2.1 -> section_code: "P", part_code: "P2", unit_label: "P2.1"
  const extractSectionAndPart = (clauseRef: string): { section: string; part: string } => {
    if (!clauseRef) return { section: '', part: '' };
    
    // Remove "table " prefix
    const cleanRef = clauseRef.replace(/^table\s+/i, '').trim();
    
    // Pattern 1: Letter+Number+Letter+Number (e.g., C1F1, D2D1, A5G1, S1C2a, S1C2A)
    // Structure: [Section Letter][Part Number][Clause Letter][Clause Number][optional suffix]
    // Example: C1F1 -> section: "C", part: "C1"
    // Example: S1C2A -> section: "S", part: "S1"
    const match = cleanRef.match(/^([A-Z])(\d+)([A-Z]\d+[a-zA-Z]?)$/);
    if (match) {
      const sectionLetter = match[1]; // "C"
      const partNumber = match[2];    // "1"
      return { section: sectionLetter, part: sectionLetter + partNumber }; // "C", "C1"
    }
    
    // Pattern 2: Letter+Number+Dot+Number (e.g., P2.1, V1.2)
    // Structure: [Section Letter][Part Number].[Clause Number]
    // Example: P2.1 -> section: "P", part: "P2"
    const match2 = cleanRef.match(/^([A-Z])(\d+)\.(\d+)/);
    if (match2) {
      const sectionLetter = match2[1]; // "P"
      const partNumber = match2[2];     // "2"
      return { section: sectionLetter, part: sectionLetter + partNumber }; // "P", "P2"
    }
    
    // Pattern 3: Simple Letter+Number (e.g., P2, V1, H4)
    // This might be a section or part reference
    const match3 = cleanRef.match(/^([A-Z])(\d+)$/);
    if (match3) {
      const sectionLetter = match3[1]; // "P"
      const partNumber = match3[2];    // "2"
      return { section: sectionLetter, part: sectionLetter + partNumber }; // "P", "P2"
    }
    
    return { section: '', part: '' };
  };
  
  // Extract para_start and para_end from source_location
  const extractParaRange = (sourceLocation: string): { start: number; end: number } => {
    const match = sourceLocation.match(/para_(\d+)_to_(\d+)/);
    if (match) {
      return { start: parseInt(match[1], 10), end: parseInt(match[2], 10) };
    }
    return { start: 0, end: 0 };
  };
  
  // Generate anchor_id from clause_ref
  const generateAnchorId = (clauseRef: string, volumeLabel: string): string => {
    if (!clauseRef) return '';
    const cleanRef = clauseRef.replace(/^table\s+/i, '').trim();
    const volumeUpper = volumeLabel.toUpperCase().replace(/\s+/g, '_');
    return `${volumeUpper}::${cleanRef}`;
  };
  
  // Infer normative_status from unit_type
  const inferNormativeStatus = (unitType: string): string => {
    if (['PERFORMANCE_REQUIREMENT', 'DTS_PROVISION', 'VERIFICATION_METHOD'].includes(unitType)) {
      return 'NORMATIVE';
    }
    return 'INFORMATIVE';
  };
  
  // Infer ncc_pathway from unit_type
  const inferNCCPathway = (unitType: string): string => {
    if (unitType === 'PERFORMANCE_REQUIREMENT') return 'PERFORMANCE';
    if (unitType === 'DTS_PROVISION') return 'DTS';
    if (unitType === 'VERIFICATION_METHOD') return 'VERIFICATION';
    return 'OBJECTIVE';
  };
  
  let orderCounter = 0;
  
  // Track table labels by table_id to ensure consistency across multiple rows for the same table
  const tableLabelMap = new Map<string, string>();
  
  // Helper function to validate if a table_id matches NCC style patterns
  // Valid patterns: C1V1, S1C2A, B1D4, P2.1, etc.
  // Invalid: "1", "2", "3", "14", etc. (numeric only)
  const isValidNCCTableId = (tableId: string): boolean => {
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
  };
  
  // Helper function to detect if a row is a table and extract table info
  const extractTableInfo = (clauseRef: string, headingText: string, unitLabel: string): { tableId: string; tableLabel: string } => {
    // Check if this is a table row
    // Tables have clause_ref starting with "table " OR title starting with "Table"
    const isTableRow = clauseRef.toLowerCase().startsWith('table ') || 
                      (headingText && headingText.trim().toLowerCase().startsWith('table '));
    
    if (!isTableRow) {
      return { tableId: '', tableLabel: '' };
    }
    
    // Extract table_id from unit_label (e.g., "S1C2A" from "S1C2A" or "table S1C2A")
    // This ensures all rows referencing the same table share the same table_id
    const tableId = unitLabel.trim();
    
    // CRITICAL: Only treat as a table if table_id matches NCC style patterns
    // Filter out noise like "1", "2", "3", etc.
    if (!isValidNCCTableId(tableId)) {
      return { tableId: '', tableLabel: '' };
    }
    
    // Extract table_label from heading_text if it starts with "Table"
    let tableLabel = '';
    if (headingText && headingText.trim().toLowerCase().startsWith('table ')) {
      // Extract the full table label (e.g., "Table S1C2a: FRLs deemed to be achieved by walls - masonry")
      const tableMatch = headingText.match(/^(Table\s+[^:]+(?::\s*[^\n]+)?)/i);
      if (tableMatch) {
        tableLabel = tableMatch[1].trim();
      } else {
        // Fallback: use the heading text as-is if it starts with "Table"
        tableLabel = headingText.trim();
      }
      
      // Store in map so other rows for the same table can use this label
      if (tableLabel && !tableLabelMap.has(tableId)) {
        tableLabelMap.set(tableId, tableLabel);
      }
    } else if (tableLabelMap.has(tableId)) {
      // If this row doesn't have a table label but we've seen one before for this table_id, reuse it
      tableLabel = tableLabelMap.get(tableId) || '';
    }
    
    return { tableId, tableLabel };
  };
  
  for (const row of rows) {
    let { section, part } = extractSectionAndPart(row.clause_ref);
    const { start, end } = extractParaRange(row.source_location);
    const anchorId = generateAnchorId(row.clause_ref, volumeLabel);
    
    // Remove "table " prefix from unit_label
    const unitLabel = row.clause_ref.replace(/^table\s+/i, '').trim();
    
    // Extract table_id and table_label for table rows
    const { tableId, tableLabel } = extractTableInfo(row.clause_ref, row.heading_text, unitLabel);
    
    // Fallback: If section/part extraction from clause_ref failed, try extracting from table_id or unit_label
    // This is critical for table rows where clause_ref might be empty or not match patterns
    if ((!section || !part) && (tableId || unitLabel)) {
      const fallbackRef = tableId || unitLabel;
      const fallbackResult = extractSectionAndPart(fallbackRef);
      if (fallbackResult.section && fallbackResult.part) {
        section = fallbackResult.section;
        part = fallbackResult.part;
      }
    }
    
    // Debug: Log discipline value for first few rows
    if (orderCounter < 5 && row.clause_ref) {
      console.log(`[CSV Conversion] Row ${orderCounter}: clause_ref="${row.clause_ref}", ncc_topic_discipline="${row.ncc_topic_discipline}"`);
    }
    
    const csvRow: CSVRow = {
      doc_id: 'ncc2022',
      volume: volumeLabel,
      state_variation: '',
      version_date: '',
      source_file: sourceFile,
      path: volumeLabel,
      anchor_id: anchorId,
      parent_anchor_id: '',
      order_in_parent: orderCounter++,
      para_start: start,
      para_end: end,
      unit_label: unitLabel,
      unit_type: row.unit_type,
      compliance_weight: '',
      title: row.heading_text,
      text: row.text,
      text_html: row.text,
      defined_term: '',
      contains_shall: row.text.toLowerCase().includes('shall'),
      contains_must: row.text.toLowerCase().includes('must'),
      external_refs: '',
      internal_refs: '',
      satisfies_pr_ids: '',
      related_unit_ids: '',
      asset_type: '',
      asset_id: '',
      asset_caption: '',
      asset_alt_text: '',
      page_start: '',
      page_end: '',
      bbox_json: '',
      extract_confidence: '',
      warnings: '',
      ncc_pathway: inferNCCPathway(row.unit_type),
      normative_status: inferNormativeStatus(row.unit_type),
      conditionality: 'ALWAYS',
      heading_context: row.heading_level,
      raw_title: row.heading_text,
      raw_text: row.text,
      applies_state: '',
      variation_action: '',
      affected_unit_label: '',
      affected_subparts: '',
      affects_anchor_id: '',
      table_grid_json: '',
      table_key_values: '',
      base_unit_label: unitLabel,
      affected_subclause: '',
      conditions_text: '',
      exceptions_text: '',
      requirements_list: '',
      standards_referenced: '',
      notes_quality: '',
      discipline: row.ncc_topic_discipline,
      table_purpose: '',
      table_id: tableId,
      table_label: tableLabel,
      applies_to_volume: volumeLabel.replace(/^Vol/i, 'V'),
      applies_to_class: '',
      volume_hierarchy: '',
      dataset_coverage: '',
      scope_conditions: '',
      formula_json: '',
      constant_value: '',
      constant_name: '',
      pathway_alternative_to: '',
      verification_method_for: '',
      section_code: section,
      part_code: part,
      indexable: true,
    };
    
    csvRows.push(csvRow);
  }
  
  return csvRows;
}

/**
 * Generate CSV content from rows
 */
function generateCSV(rows: CSVRow[]): string {
  if (rows.length === 0) return '';
  
  // Get all column names from first row
  const columns = Object.keys(rows[0]);
  
  // CSV escape function - handles all edge cases
  // CRITICAL: This function must properly escape all special characters
  const escapeCSV = (value: any): string => {
    // Handle null/undefined
    if (value === null || value === undefined) return '""';
    
    // Handle boolean values before converting to string
    let str: string;
    if (typeof value === 'boolean') {
      str = value ? 'true' : 'false';
    } else if (typeof value === 'number') {
      str = String(value);
    } else {
      str = String(value);
    }
    
    // CRITICAL: Replace newlines and carriage returns with spaces
    // This ensures CSV compatibility with all parsers (Excel, etc.)
    // Multiline fields in CSV are valid per RFC 4180 but break many parsers
    str = str.replace(/\r\n/g, ' ').replace(/\r/g, ' ').replace(/\n/g, ' ');
    
    // Always quote if:
    // 1. Contains comma or quote
    // 2. Starts or ends with whitespace
    // 3. Is empty string (to preserve it)
    const needsQuoting = 
      str.includes(',') || 
      str.includes('"') ||
      str.trim() !== str ||
      str === '';
    
    if (needsQuoting) {
      // CRITICAL: Escape internal double quotes by doubling them (RFC 4180)
      str = str.replace(/"/g, '""');
      // Wrap in quotes
      return `"${str}"`;
    }
    
    return str;
  };
  
  // Generate header
  const header = columns.map(escapeCSV).join(',');
  
  // Generate rows - each row is guaranteed to be on a single line
  const csvRows = rows.map((row, rowIndex) => {
    try {
      const rowString = columns.map(col => {
        const value = row[col];
        return escapeCSV(value);
      }).join(',');
      
      return rowString;
    } catch (error) {
      console.error(`[CSV Generation] Error processing row ${rowIndex}:`, error);
      // Return a safe row with empty values
      return columns.map(() => '""').join(',');
    }
  });
  
  // Join with newlines - each row is now guaranteed to be on a single line
  return [header, ...csvRows].join('\n');
}

/**
 * Extract clause reference from text (best effort)
 * Handles patterns like H2V1, H2V1a, H2V1b, etc.
 */
function extractClauseRef(text: string): string {
  // Patterns: H4D3, D2D1, A2G2, P2.1, V1.2, H2V1a, H2V1b, S1C2a, S1C3b, etc.
  // CRITICAL: Check for patterns WITH letter suffixes FIRST (more specific)
  // This ensures S1C2a is extracted instead of just S1C2 when both appear
  
  // Pattern 1: Most specific - letter+number+letter+number+letter (e.g., S1C2a, H2V1b, S1C3b)
  // This MUST come first to prioritize suffixed references
  // Matches: "S1C2a", "Table S1C2a", "Tables S1C2a, S1C2b", etc.
  const suffixedPattern = /\b([A-Z]\d+[A-Z]\d+[a-z])\b/i;
  const suffixedMatch = text.match(suffixedPattern);
  if (suffixedMatch && suffixedMatch[1]) {
    return suffixedMatch[1].toUpperCase(); // Return S1C2A, H2V1B, etc.
  }
  
  // Pattern 2: Letter+number+letter+number (e.g., H2V1, H4D3, D2D1, A2G2, S1C2)
  // Only match if no suffixed version was found
  const doublePattern = /\b([A-Z]\d+[A-Z]\d+)\b/i;
  const doubleMatch = text.match(doublePattern);
  if (doubleMatch && doubleMatch[1]) {
    return doubleMatch[1].toUpperCase();
  }
  
  // Pattern 3: Letter+number+dot+number (e.g., P2.1, V1.2)
  const dotPattern = /\b([A-Z]\d+\.\d+)\b/i;
  const dotMatch = text.match(dotPattern);
  if (dotMatch && dotMatch[1]) {
    return dotMatch[1].toUpperCase();
  }
  
  // Pattern 4: Simple letter+number (e.g., P2, V1, H4)
  const simplePattern = /\b([A-Z]\d+)\b/i;
  const simpleMatch = text.match(simplePattern);
  if (simpleMatch && simpleMatch[1]) {
    return simpleMatch[1].toUpperCase();
  }

  return '';
}

/**
 * Format table as RAG-friendly markdown-style table
 */
function formatTableForRAG(table: HTMLTableElement, clauseRef: string, clauseRefRowIndex: number): string {
  const rows = table.querySelectorAll('tr');
  const formattedRows: string[] = [];
  
  // Process each row
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    const cells = row.querySelectorAll('td, th');
    const cellTexts: string[] = [];
    
    for (let cIdx = 0; cIdx < cells.length; cIdx++) {
      const cell = cells[cIdx];
      let text = cell.textContent?.trim() || '';
      
      // If this is the clause ref row and cell, remove the clause ref from the cell text
      // (it will be in clause_ref column, not in the table text)
      // Note: clauseRef might have "table " prefix, so remove that for matching
      if (rIdx === clauseRefRowIndex && clauseRef) {
        const baseClauseRef = clauseRef.replace(/^table\s+/i, '');
        text = text.replace(new RegExp(`^${baseClauseRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[–—:.-]?\\s*`), '').trim();
      }
      
      // Escape pipe characters in cell content (markdown table separator)
      text = text.replace(/\|/g, '\\|');
      cellTexts.push(text);
    }
    
    if (cellTexts.length > 0) {
      formattedRows.push('| ' + cellTexts.join(' | ') + ' |');
    }
  }
  
  // Add separator row after header (if we have at least 2 rows)
  if (formattedRows.length > 1) {
    const firstRow = formattedRows[0];
    const columnCount = (firstRow.match(/\|/g) || []).length - 1;
    if (columnCount > 0) {
      const separator = '|' + ' --- |'.repeat(columnCount);
      formattedRows.splice(1, 0, separator);
    }
  }
  
  return formattedRows.join('\n');
}

/**
 * Classify unit type based on text content
 */
function classifyUnitType(text: string): ExcelRow['unit_type'] {
  const lowerText = text.toLowerCase();

  // PERFORMANCE_REQUIREMENT
  if (
    /^P\d+/.test(text) ||
    lowerText.includes('performance requirement') ||
    /P\d+\.\d+/.test(text) ||
    /P\d+[A-Z]\d+/.test(text)
  ) {
    return 'PERFORMANCE_REQUIREMENT';
  }

  // DTS_PROVISION
  if (
    lowerText.includes('deemed-to-satisfy') ||
    lowerText.includes('deemed to satisfy') ||
    lowerText.includes('dts') ||
    /^D\d+/.test(text) ||
    /D\d+\.\d+/.test(text) ||
    (lowerText.includes('must') && lowerText.includes('dts'))
  ) {
    return 'DTS_PROVISION';
  }

  // VERIFICATION_METHOD
  if (
    lowerText.includes('verification method') ||
    /^V\d+/.test(text) ||
    /V\d+\.\d+/.test(text)
  ) {
    return 'VERIFICATION_METHOD';
  }

  // EVIDENCE_OF_SUITABILITY
  if (lowerText.includes('evidence of suitability')) {
    return 'EVIDENCE_OF_SUITABILITY';
  }

  // DEFINITION
  if (
    lowerText.includes('definition') ||
    /^[A-Z][^—]+—/.test(text) || // Term — meaning
    /^[A-Z][^means]+means/.test(text) // Term means
  ) {
    return 'DEFINITION';
  }

  return 'OTHER';
}

