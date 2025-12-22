/**
 * Clause Detection Engine for Australian NCC / AS / AS-NZS Standards
 * 
 * This module implements regex-based clause detection without LLM/AI.
 * All patterns are deterministic and rule-based.
 * 
 * To extend clause detection rules:
 * 1. Add new regex patterns to the PATTERNS array
 * 2. Add exclusion filters to the shouldExclude function
 * 3. Update the Clause interface if needed
 */

import { Clause } from '@/types';

/**
 * Regex patterns for clause detection (in order of specificity)
 * 
 * Pattern order matters - more specific patterns should come first
 */
const CLAUSE_PATTERNS = [
  // Pattern 1: Clauses with subclause suffix like (a), (i) - most specific
  // Matches: D1.6(a), 2.6.3.3.2(a), E2.2a(b)
  // More flexible spacing
  {
    name: 'clause_with_subclause',
    regex: /^\s*((?:\d+(?:\.\d+){1,4})|(?:[A-Z]{1,2}\d+(?:\.\d+)*[a-z]?)|(?:[A-Z]\.\d+(?:\.\d+){0,3}))(\([a-zivx]+\))?\s*[ .\-–:]*\s*(.*)$/,
    extractGroups: (match: RegExpMatchArray) => {
      const baseClause = match[1];
      const subclause = match[2] || '';
      const text = match[3] || '';
      return {
        clauseNumber: baseClause + subclause,
        text: text.trim()
      };
    }
  },
  
  // Pattern 2: AS/NZS-style numeric clauses (e.g., 2.6, 2.6.3, 2.6.3.3.2)
  // More flexible spacing: allows for tabs, multiple spaces, or no separator
  // Requires at least ONE dot to avoid matching bare numbers like "1" or "2"
  {
    name: 'numeric_clause',
    regex: /^\s*(\d+(?:\.\d+){1,4})\s*[ .\-–:]*\s*(.*)$/,
    extractGroups: (match: RegExpMatchArray) => ({
      clauseNumber: match[1],
      text: (match[2] || '').trim()
    })
  },
  
  // Pattern 3: Lettered clauses (NCC style: E2.2, E2.2a, FP1.4, CP1, GP5.2)
  // More flexible spacing
  {
    name: 'lettered_clause',
    regex: /^\s*([A-Z]{1,2}\d+(?:\.\d+)*[a-z]?)\s*[ .\-–:]*\s*(.*)$/,
    extractGroups: (match: RegExpMatchArray) => ({
      clauseNumber: match[1],
      text: (match[2] || '').trim()
    })
  },
  
  // Pattern 4: Appendix-style clauses (A.1, A.1.2, B.3.4.1)
  // More flexible spacing
  {
    name: 'appendix_clause',
    regex: /^\s*([A-Z]\.\d+(?:\.\d+){0,3})\s*[ .\-–:]*\s*(.*)$/,
    extractGroups: (match: RegExpMatchArray) => ({
      clauseNumber: match[1],
      text: (match[2] || '').trim()
    })
  },
  
  // Pattern 5: Pure subclauses (a), (i) - optional, typically not exported
  // Uncomment if you want to detect standalone subclauses
  // {
  //   name: 'pure_subclause',
  //   regex: /^\s*\(([a-z]|[ivx]+)\)\s+(.*)$/,
  //   extractGroups: (match: RegExpMatchArray) => ({
  //     clauseNumber: `(${match[1]})`,
  //     text: (match[2] || '').trim()
  //   })
  // }
];

/**
 * Exclusion filters to prevent false positives
 * 
 * Add new exclusion rules here to filter out non-clauses
 */
function shouldExclude(text: string): boolean {
  const trimmed = text.trim();
  
  // Exclude table references
  if (/^(Table|TABLE|Tab\.|Tab\s)/i.test(trimmed)) {
    return true;
  }
  
  // Exclude figure references
  if (/^(Figure|FIGURE|Fig\.|Fig\s)/i.test(trimmed)) {
    return true;
  }
  
  // Exclude page references
  if (/^\s*Page\s+\d+/i.test(trimmed)) {
    return true;
  }
  
  // Exclude lines that start with units (kW, W, A, V, Hz, mm, kg)
  // Only exclude if unit appears as the first meaningful token (not in clause text)
  const firstToken = trimmed.split(/\s+/)[0];
  // Exclude if first token is a unit followed by a number (e.g., "2.4 kW")
  if (/^\d+\.?\d*\s*(kW|W|A|V|Hz|mm|kg|m|cm|km|MHz|GHz)\b/i.test(trimmed.substring(0, 20))) {
    return true;
  }
  
  // Exclude lines that are just numbers with units (e.g., "240 V", "50 Hz")
  if (/^\d+\.?\d*\s*(kW|W|A|V|Hz|mm|kg|m|cm|km|MHz|GHz)\s*$/i.test(trimmed)) {
    return true;
  }
  
  // Exclude very short lines (likely not clauses)
  // Minimum 3 characters to allow "1.4" but exclude "1" or "2"
  if (trimmed.length < 3) {
    return true;
  }
  
  return false;
}

/**
 * Fix comma corruption in clause numbers (OCR errors where dots become commas)
 * Returns fixed clause number
 */
function fixCommaCorruptionInClauseNumber(clauseNumber: string): string {
  if (!clauseNumber.includes(',')) {
    return clauseNumber;
  }

  let fixed = clauseNumber;

  // Rule A: Simple continuation (\d+\.\d+),(\d+) → \d+\.\d+\.\d+
  // Pattern: A.B,C → A.B.C (where C is a single number, not followed by dot)
  fixed = fixed.replace(/(\d+\.\d+),(\d+)(?!\.)/g, (match) => {
    return match.replace(',', '.');
  });

  // Rule B: Deeper continuation (\d+\.\d+),(\d+\.\d+) → \d+\.\d+\.\d+\.\d+
  // Apply if right side has multiple segments (indicating continuation)
  fixed = fixed.replace(/(\d+(?:\.\d+)+),(\d+\.\d+)/g, (match, left, right) => {
    const leftParts = left.split('.');
    const rightParts = right.split('.');
    const leftLastSegment = parseInt(leftParts[leftParts.length - 1], 10);
    const rightFirstSegment = parseInt(rightParts[0], 10);

    // If right has multiple segments (e.g., 1.3.3), it's likely continuation
    // OR if right starts with same number as left's last segment
    if (rightParts.length > 1 || rightFirstSegment === leftLastSegment) {
      return `${left}.${right}`;
    }
    
    return match; // Don't fix if unclear
  });

  return fixed;
}

/**
 * Detects clauses in a paragraph
 * 
 * @param paragraph - The paragraph text to analyze
 * @param paragraphIndex - Index of the paragraph in the document
 * @returns Clause object if detected, null otherwise
 */
export function detectClause(paragraph: string, paragraphIndex: number): Clause | null {
  // Skip empty paragraphs
  if (!paragraph || !paragraph.trim()) {
    return null;
  }
  
  // Apply exclusion filters first
  if (shouldExclude(paragraph)) {
    return null;
  }
  
  // Try each pattern in order
  for (const pattern of CLAUSE_PATTERNS) {
    const match = paragraph.match(pattern.regex);
    if (match) {
      const { clauseNumber, text } = pattern.extractGroups(match);
      
      // Validate that we extracted meaningful data
      if (clauseNumber && clauseNumber.length > 0) {
        // Fix comma corruption in clause number (e.g., 2.4,3 → 2.4.3)
        const cleanedClauseNumber = fixCommaCorruptionInClauseNumber(clauseNumber);
        
        return {
          id: `clause-${paragraphIndex}-${cleanedClauseNumber}`,
          clauseNumber: cleanedClauseNumber,
          text: text || paragraph, // Fallback to full paragraph if no text extracted
          paragraphIndex,
          markedBy: 'auto'
        };
      }
    }
  }
  
  return null;
}

/**
 * Detects notes, exceptions, warnings, and jurisdiction-specific text
 * 
 * @param paragraph - The paragraph text to analyze
 * @returns Object with detected type and text, or null
 */
function detectNoteOrException(paragraph: string): { type: 'note' | 'exception' | 'warning' | 'jurisdiction'; text: string } | null {
  const trimmed = paragraph.trim();
  if (!trimmed) return null;
  
  // NOTE / NOTES
  if (/^NOTE\b/i.test(trimmed)) {
    return { type: 'note', text: trimmed };
  }
  if (/^NOTES\b/i.test(trimmed)) {
    return { type: 'note', text: trimmed };
  }
  
  // EXCEPTION / EXCEPT
  if (/^EXCEPTION\b/i.test(trimmed)) {
    return { type: 'exception', text: trimmed };
  }
  if (/^EXCEPT\b/i.test(trimmed)) {
    return { type: 'exception', text: trimmed };
  }
  
  // WARNING / CAUTION
  if (/^WARNING\b/i.test(trimmed)) {
    return { type: 'warning', text: trimmed };
  }
  if (/^CAUTION\b/i.test(trimmed)) {
    return { type: 'warning', text: trimmed };
  }
  
  // New Zealand only / NZ only
  if (/^New Zealand only\b/i.test(trimmed) || /^NZ only\b/i.test(trimmed)) {
    return { type: 'jurisdiction', text: trimmed };
  }
  
  return null;
}

/**
 * Detects all clauses in a document and collects full clause content
 * Also detects and attaches notes, exceptions, warnings, and jurisdiction-specific text
 * 
 * @param paragraphs - Array of paragraph texts
 * @returns Array of detected clauses with full content and attached notes/exceptions
 */
export function detectAllClauses(paragraphs: string[]): Clause[] {
  const clauses: Clause[] = [];
  
  // Debug logging (always log first 5 paragraphs to see document structure)
  if (paragraphs.length > 0) {
    console.log('[Clause Detection] Processing', paragraphs.length, 'paragraphs');
    console.log('[Clause Detection] First 5 paragraphs:', paragraphs.slice(0, 5));
  }
  
  // First pass: detect all clause headings
  const clauseHeadings: Array<{ index: number; clause: Clause }> = [];
  
  paragraphs.forEach((paragraph, index) => {
    const clause = detectClause(paragraph, index);
    if (clause) {
      clauseHeadings.push({ index, clause });
    }
  });
  
  // Second pass: collect full content and notes/exceptions for each clause
  clauseHeadings.forEach(({ index, clause }, headingIndex) => {
    const clauseParagraphs: string[] = [];
    const notes: string[] = [];
    const exceptions: string[] = [];
    const warnings: string[] = [];
    const jurisdiction: string[] = [];
    
    // Start from the clause heading paragraph
    clauseParagraphs.push(paragraphs[index]);
    
    // Collect all following paragraphs until the next clause or end of document
    const nextClauseIndex = headingIndex < clauseHeadings.length - 1 
      ? clauseHeadings[headingIndex + 1].index 
      : paragraphs.length;
    
    // Add all paragraphs between this clause and the next one
    for (let i = index + 1; i < nextClauseIndex; i++) {
      const para = paragraphs[i];
      if (para && para.trim()) {
        // Skip if this paragraph starts with a clause number (it's a new clause)
        const isNextClause = detectClause(para, i) !== null;
        if (isNextClause) {
          break;
        }
        
        // Check if this is a note, exception, warning, or jurisdiction-specific
        const noteOrException = detectNoteOrException(para);
        if (noteOrException) {
          // Store in appropriate array, but don't add to main clause text
          switch (noteOrException.type) {
            case 'note':
              notes.push(noteOrException.text);
              break;
            case 'exception':
              exceptions.push(noteOrException.text);
              break;
            case 'warning':
              warnings.push(noteOrException.text);
              break;
            case 'jurisdiction':
              jurisdiction.push(noteOrException.text);
              break;
          }
        } else {
          // Regular content paragraph
          clauseParagraphs.push(para);
        }
      }
    }
    
    // Combine all paragraphs into full clause text
    const fullClauseText = clauseParagraphs
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .join(' ');
    
    // Update clause with full content and attached notes/exceptions
    const clauseWithContent: Clause = {
      ...clause,
      text: fullClauseText || clause.text, // Use full content, fallback to original if empty
      notes: notes.length > 0 ? notes : undefined,
      exceptions: exceptions.length > 0 ? exceptions : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      jurisdiction: jurisdiction.length > 0 ? jurisdiction : undefined,
    };
    
    clauses.push(clauseWithContent);
  });
  
  if (clauses.length > 0) {
    console.log('[Clause Detection] Total clauses detected:', clauses.length);
    console.log('[Clause Detection] First 5 clauses:', clauses.slice(0, 5).map(c => ({ clauseNumber: c.clauseNumber, text: c.text.substring(0, 50) })));
    const withNotes = clauses.filter(c => c.notes && c.notes.length > 0).length;
    const withExceptions = clauses.filter(c => c.exceptions && c.exceptions.length > 0).length;
    if (withNotes > 0 || withExceptions > 0) {
      console.log(`[Clause Detection] Clauses with notes: ${withNotes}, with exceptions: ${withExceptions}`);
    }
  } else {
    console.warn('[Clause Detection] ⚠️  NO CLAUSES DETECTED!');
  }
  
  return clauses;
}

