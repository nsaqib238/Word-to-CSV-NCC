/**
 * Table Extraction Engine with LTE (Layout-to-Text Encoding) Format
 * 
 * Extracts tables from HTML and converts them to LTE format for RAG systems.
 * Deterministic, rule-based extraction - no AI/LLM.
 */

import { ExtractedTable } from '@/types';

/**
 * Extract text content from a DOM element, preserving structure
 */
function getTextContent(element: Element): string {
  return element.textContent?.trim() || '';
}

/**
 * Check if a block element is empty or should be ignored
 */
function isEmptyBlock(element: Element): boolean {
  const text = getTextContent(element);
  return text.length === 0;
}

/**
 * Check if element is a heading
 */
function isHeading(element: Element): boolean {
  return /^h[1-6]$/i.test(element.tagName);
}

/**
 * Check if element is a table
 */
function isTable(element: Element): boolean {
  return element.tagName.toLowerCase() === 'table';
}

/**
 * Get all block elements (p, h1-h6, li, div) from HTML in document order
 * Uses pre-assigned DOM indices from elementDomIndices map
 * Returns array of {element, index, text, domIndex} for tracking
 */
function getBlockElements(
  root: HTMLElement,
  elementDomIndices: Map<Element, number>
): Array<{ element: Element; index: number; text: string; domIndex: number }> {
  const blocks: Array<{ element: Element; index: number; text: string; domIndex: number }> = [];
  let index = 0;

  // Get all potential block elements
  const allElements = root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, div');
  
  allElements.forEach((el) => {
    // Skip if inside a table
    if (el.closest('table')) return;
    
    // For divs, only include if they contain direct text and no nested complex structures
    if (el.tagName.toLowerCase() === 'div') {
      const hasDirectText = Array.from(el.childNodes).some(
        node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
      );
      const hasComplexNested = el.querySelector('table, ul, ol, div');
      if (!hasDirectText || hasComplexNested) return;
    }
    
    // For list items, only include if they contain standalone text
    if (el.tagName.toLowerCase() === 'li') {
      const text = getTextContent(el);
      if (!text) return;
    }
    
    const text = getTextContent(el);
    if (text) {
      const domIndex = elementDomIndices.get(el) ?? 0;
      blocks.push({ element: el, index, text, domIndex });
      index++;
    }
  });

  return blocks;
}

/**
 * Detect table caption from preceding blocks
 * Returns {id, title, paragraphIndex} or null
 */
function detectTableCaption(
  table: HTMLTableElement,
  blocks: Array<{ element: Element; index: number; text: string; domIndex: number }>,
  tableDomIndex: number
): { id: string; title: string; paragraphIndex: number } | null {
  // Find blocks that appear before this table in document order
  const precedingBlocks = blocks
    .filter(block => block.domIndex < tableDomIndex)
    .sort((a, b) => b.domIndex - a.domIndex); // Sort descending (closest first)
  
  // Search up to 5 blocks before the table
  const searchWindow = Math.min(5, precedingBlocks.length);
  
  for (let i = 0; i < searchWindow; i++) {
    const block = precedingBlocks[i];
    const text = block.text.trim();
    
    // Match: ^(Table|TABLE|Tab\.?)\s*\d+(\.\d+)?\b.*
    const captionMatch = text.match(/^(Table|TABLE|Tab\.?)\s*(\d+(?:\.\d+)?)\b(.*)$/i);
    
    if (captionMatch) {
      const tableNum = captionMatch[2];
      const title = captionMatch[3]?.trim() || '';
      const id = `Table ${tableNum}`;
      
      return {
        id,
        title,
        paragraphIndex: block.index
      };
    }
  }
  
  return null;
}

/**
 * Detect table notes from surrounding blocks
 * Returns array of note texts
 */
function detectTableNotes(
  table: HTMLTableElement,
  blocks: Array<{ element: Element; index: number; text: string; domIndex: number }>,
  tableDomIndex: number,
  allTableIndices: number[]
): string[] {
  const notes: string[] = [];
  
  // Note patterns (case-insensitive)
  const notePatterns = [
    /^NOTE\b/i,
    /^NOTES\b/i,
    /^Note:\s*/i,
    /^Notes:\s*/i,
    /^Footnote\b/i,
    /^Footnotes\b/i,
    /^Note to Table\b/i,
    /^Notes for Table\b/i,
    /^Note to table\b/i,
    /^Notes for table\b/i,
  ];
  
  // Find blocks within 3 blocks above and 3 blocks below
  const windowSize = 3;
  
  // Get blocks above (preceding)
  const blocksAbove = blocks
    .filter(block => {
      const dist = tableDomIndex - block.domIndex;
      return dist > 0 && dist <= windowSize * 10; // Allow some flexibility
    })
    .sort((a, b) => b.domIndex - a.domIndex); // Closest first
  
  // Get blocks below (following)
  const blocksBelow = blocks
    .filter(block => {
      const dist = block.domIndex - tableDomIndex;
      return dist > 0 && dist <= windowSize * 10;
    })
    .sort((a, b) => a.domIndex - b.domIndex); // Closest first
  
  // Check for stop conditions (another table or heading)
  const stopAtDomIndex = (domIndex: number): boolean => {
    // Check if there's another table nearby
    const otherTableNearby = allTableIndices.some(ti => 
      ti !== tableDomIndex && Math.abs(ti - domIndex) < 50
    );
    if (otherTableNearby) return true;
    
    // Check if block is a heading (hard boundary)
    const block = blocks.find(b => b.domIndex === domIndex);
    if (block && isHeading(block.element)) return true;
    
    return false;
  };
  
  // Scan blocks below first (priority), then above
  const blocksToCheck = [...blocksBelow.slice(0, windowSize), ...blocksAbove.slice(0, windowSize)];
  
  // Also check for consecutive empty blocks (section break)
  let emptyCount = 0;
  
  for (const block of blocksToCheck) {
    // Stop if we hit a boundary
    if (stopAtDomIndex(block.domIndex)) break;
    
    const text = block.text.trim();
    
    // Track empty blocks
    if (!text) {
      emptyCount++;
      if (emptyCount >= 2) break; // Two consecutive empty blocks = section break
      continue;
    }
    emptyCount = 0;
    
    // Check if it matches any note pattern
    const isNote = notePatterns.some(pattern => pattern.test(text));
    
    if (isNote) {
      notes.push(text);
    }
  }
  
  // Deduplicate and limit
  return Array.from(new Set(notes)).slice(0, 5);
}

/**
 * Encode a table cell value according to LTE rules
 */
function encodeCell(cell: HTMLTableCellElement): string {
  let text = getTextContent(cell);
  
  // Trim leading/trailing whitespace
  text = text.trim();
  
  // Collapse multiple spaces to one
  text = text.replace(/\s+/g, ' ');
  
  // Convert internal newlines to ⏎
  text = text.replace(/\n/g, '⏎');
  
  // Escape pipe | as \|
  text = text.replace(/\|/g, '\\|');
  
  // Handle merged cells
  const colspan = cell.getAttribute('colspan');
  const rowspan = cell.getAttribute('rowspan');
  
  if (colspan && parseInt(colspan) > 1) {
    text += `{colspan=${colspan}}`;
  }
  
  if (rowspan && parseInt(rowspan) > 1) {
    text += `{rowspan=${rowspan}}`;
  }
  
  return text;
}

/**
 * Convert a table to LTE format
 */
function tableToLTE(table: HTMLTableElement, tableId: string, title: string, notes: string): string {
  const rows: string[] = [];
  const tableRows = table.querySelectorAll('tr');
  
  if (tableRows.length === 0) {
    return ''; // Empty table
  }
  
  // Process each row
  tableRows.forEach((row) => {
    const cells = row.querySelectorAll('td, th');
    if (cells.length === 0) return;
    
    const cellValues = Array.from(cells).map(cell => encodeCell(cell));
    const rowText = '| ' + cellValues.join(' | ') + ' |';
    rows.push(rowText);
  });
  
  // Count rows and columns
  const rowCount = rows.length;
  const colCount = Math.max(...Array.from(tableRows).map(row => 
    row.querySelectorAll('td, th').length
  ), 0);
  
  // Build LTE block
  const lteLines = [
    '[LTE_TABLE]',
    `id: ${tableId}`,
    `title: ${title || ''}`,
    'source: docx',
    `location: paragraphIndex=${-1}`, // Will be updated by caller
    `shape: rows=${rowCount} cols=${colCount}`,
    'notes:',
    notes || '',
    'grid:',
    ...rows,
    '[/LTE_TABLE]'
  ];
  
  return lteLines.join('\n');
}

/**
 * Extract all tables from HTML and convert to LTE format
 */
export function extractTables(html: string, paragraphs: string[]): ExtractedTable[] {
  // Create off-DOM container
  const root = document.createElement('div');
  root.innerHTML = html;
  
  // Find all tables
  const tables = Array.from(root.querySelectorAll('table')) as HTMLTableElement[];
  
  if (tables.length === 0) {
    return [];
  }
  
  // Assign DOM indices to all elements (including tables) by walking the tree
  let domIndexCounter = 0;
  const elementDomIndices = new Map<Element, number>();
  
  function assignDomIndices(node: Node): void {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      elementDomIndices.set(el, domIndexCounter++);
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      assignDomIndices(child);
    }
  }
  assignDomIndices(root);
  
  // Get all block elements for caption/note detection (with DOM indices)
  const blocks = getBlockElements(root, elementDomIndices);
  
  // Get table DOM indices
  const tableDomIndices = tables.map(table => elementDomIndices.get(table) || 0);
  
  // Create a map of paragraph text to index for finding paragraphIndex
  const paragraphMap = new Map<string, number>();
  paragraphs.forEach((para, idx) => {
    const trimmed = para.trim();
    if (trimmed) {
      paragraphMap.set(trimmed, idx);
      // Also store first 50 chars for fuzzy matching
      if (trimmed.length > 50) {
        paragraphMap.set(trimmed.substring(0, 50), idx);
      }
    }
  });
  
  const extractedTables: ExtractedTable[] = [];
  let autoCounter = 1;
  
  tables.forEach((table, tableIdx) => {
    // Skip if table has zero rows
    const rowCount = table.querySelectorAll('tr').length;
    if (rowCount === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Table Extraction] Skipping table with zero rows');
      }
      return;
    }
    
    const tableDomIndex = tableDomIndices[tableIdx];
    
    // Detect caption
    const caption = detectTableCaption(table, blocks, tableDomIndex);
    
    let tableId: string;
    let title: string;
    let paragraphIndex: number;
    
    if (caption) {
      tableId = caption.id;
      title = caption.title;
      paragraphIndex = caption.paragraphIndex;
    } else {
      // Auto-generate ID
      tableId = `Table-AUTO-${String(autoCounter).padStart(3, '0')}`;
      title = '';
      
      // Try to find nearest preceding paragraph
      const precedingBlocks = blocks
        .filter(block => block.domIndex < tableDomIndex)
        .sort((a, b) => b.domIndex - a.domIndex); // Closest first
      
      let foundIndex = -1;
      
      // Search backwards through blocks to find one that matches a paragraph
      for (const block of precedingBlocks.slice(0, 5)) {
        // Check if this block's text matches any paragraph
        const paraIndex = paragraphMap.get(block.text) ?? 
                         paragraphMap.get(block.text.substring(0, Math.min(50, block.text.length)));
        
        if (paraIndex !== undefined) {
          foundIndex = paraIndex;
          break;
        }
      }
      
      paragraphIndex = foundIndex >= 0 ? foundIndex : -1;
      autoCounter++;
    }
    
    // Detect notes
    const notes = detectTableNotes(table, blocks, tableDomIndex, tableDomIndices);
    const notesText = notes.join('\n').trim();
    
    // Convert to LTE
    const lteText = tableToLTE(table, tableId, title, notesText);
    
    // Count rows and columns
    const rows = table.querySelectorAll('tr').length;
    const cols = Math.max(...Array.from(table.querySelectorAll('tr')).map(row => 
      row.querySelectorAll('td, th').length
    ), 0);
    
    // Update paragraphIndex in LTE if we found one
    let finalLteText = lteText;
    if (paragraphIndex >= 0) {
      finalLteText = lteText.replace(
        /location: paragraphIndex=-1/,
        `location: paragraphIndex=${paragraphIndex}`
      );
    }
    
    extractedTables.push({
      id: tableId,
      title,
      paragraphIndex,
      rows,
      cols,
      notes: notesText,
      lteText: finalLteText
    });
  });
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[Table Extraction] Extracted', extractedTables.length, 'tables');
  }
  
  return extractedTables;
}

