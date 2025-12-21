/**
 * Format Repair Pipeline
 * 
 * This module cleans up HTML and text after DOCX conversion.
 * It removes formatting issues, normalizes whitespace, and preserves
 * important structural elements (headings, lists, tables, clause numbers).
 * 
 * IMPORTANT: This does NOT rewrite or paraphrase content.
 * It only fixes formatting issues deterministically.
 */

import sanitizeHtml from 'sanitize-html';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';

/**
 * Sanitize HTML configuration
 * Preserves structural elements while removing junk Word markup
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'strong', 'em', 'b', 'i', 'u',
    'br', 'span', 'div',
    'blockquote'
  ],
  allowedAttributes: {
    '*': ['class', 'id', 'style'],
    'table': ['border', 'cellpadding', 'cellspacing'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan']
  },
  allowedStyles: {
    '*': {
      'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
      'font-weight': [/^bold$/, /^normal$/],
      'font-style': [/^italic$/, /^normal$/]
    }
  }
};

/**
 * Removes multiple spaces and normalizes whitespace
 * 
 * IMPORTANT: Less aggressive to preserve clause number formatting
 */
function normalizeWhitespace(text: string): string {
  return text
    // Replace multiple spaces with single space (but preserve single spaces)
    .replace(/[ \t]{2,}/g, ' ')  // Only replace 2+ spaces/tabs, not single ones
    // Replace multiple newlines with double newline (preserve paragraph breaks)
    .replace(/\n{3,}/g, '\n\n')
    // Remove zero-width characters (these are invisible and safe to remove)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Normalize non-breaking spaces to regular spaces
    .replace(/\u00A0/g, ' ')
    .trim();
    // REMOVED: Aggressive line trimming that might remove clause number spacing
    // .split('\n')
    // .map(line => line.trim())
    // .join('\n')
}

/**
 * Removes empty paragraphs and duplicate paragraphs
 */
function removeEmptyParagraphs(html: string): string {
  // Remove empty <p> tags
  html = html.replace(/<p[^>]*>\s*<\/p>/gi, '');
  // Remove <p> tags with only whitespace
  html = html.replace(/<p[^>]*>[\s\u00A0]*<\/p>/gi, '');
  return html;
}

/**
 * Joins broken lines caused by Word line-wrap
 * De-hyphenates wrapped words (e.g., "inter-\nnational" → "international")
 * 
 * IMPORTANT: This function is now less aggressive to preserve clause numbers.
 * It only joins lines that are clearly broken, not lines that might be separate clauses.
 */
function joinBrokenLines(text: string): string {
  return text
    // Only join hyphenated line breaks: "word-\nword" → "wordword"
    // This is safe because it's clearly a broken word
    .replace(/([a-z])-\s*\n\s*([a-z])/gi, '$1$2');
    // REMOVED: Aggressive line joining that might merge separate clauses
    // .replace(/([a-z0-9])\s*\n\s*([a-z])/gi, '$1 $2')
    // REMOVED: This might join clause numbers incorrectly
    // .replace(/([.!?])\s*\n\s*/g, '$1\n');
}

/**
 * Cleans up HTML using sanitize-html
 */
function sanitizeHtmlContent(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

/**
 * Cleans up HTML structure using rehype
 * Note: We skip rehype-sanitize here since we already sanitized with sanitize-html
 * This step is mainly for structural normalization (whitespace, empty elements)
 */
async function cleanHtmlStructure(html: string): Promise<string> {
  try {
    const processor = unified()
      .use(rehypeParse, { fragment: true })
      // Skip rehype-sanitize - already sanitized, just normalize structure
      .use(rehypeStringify);
    
    const result = await processor.process(html);
    return String(result);
  } catch (error) {
    console.error('Error cleaning HTML structure:', error);
    return html; // Return original on error
  }
}

/**
 * Extracts paragraphs from HTML
 * Properly extracts text from paragraph-like elements (p, h1-h6, li, div)
 * 
 * IMPORTANT: Preserves spacing around clause numbers
 */
function extractParagraphs(html: string): string[] {
  // Use a simple regex to extract text from paragraph-like elements
  // This preserves the structure better than just removing all tags
  const paragraphs: string[] = [];
  
  // Extract text from <p> tags
  const pMatches = html.match(/<p[^>]*>(.*?)<\/p>/gis);
  if (pMatches) {
    pMatches.forEach(match => {
      const text = match
        .replace(/<[^>]+>/g, ' ') // Remove nested tags but preserve spacing
        .replace(/\s{2,}/g, ' ')   // Only collapse multiple spaces, not all whitespace
        .trim();
      if (text) paragraphs.push(text);
    });
  }
  
  // Extract text from headings (h1-h6)
  const headingMatches = html.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gis);
  if (headingMatches) {
    headingMatches.forEach(match => {
      const text = match
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (text) paragraphs.push(text);
    });
  }
  
  // Extract text from list items
  const liMatches = html.match(/<li[^>]*>(.*?)<\/li>/gis);
  if (liMatches) {
    liMatches.forEach(match => {
      const text = match
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (text) paragraphs.push(text);
    });
  }
  
  // If no structured elements found, fall back to simple extraction
  if (paragraphs.length === 0) {
    const textOnly = html
      .replace(/<[^>]+>/g, '\n')
      .replace(/\n{3,}/g, '\n\n')  // Preserve paragraph breaks
      .trim();
    
    const fallbackParagraphs = textOnly
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    return fallbackParagraphs;
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[Format Repair] Extracted', paragraphs.length, 'paragraphs');
  }
  
  return paragraphs;
}

/**
 * Main format repair function
 * 
 * @param htmlRaw - Raw HTML from Mammoth conversion
 * @param textRaw - Raw text from Mammoth conversion
 * @returns Cleaned HTML and text with extracted paragraphs
 */
export async function repairFormat(
  htmlRaw: string,
  textRaw: string
): Promise<{
  html_clean: string;
  text_clean: string;
  paragraphs_clean: string[];
}> {
  // Debug logging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Format Repair] Starting format repair pipeline');
  }
  
  // Step 1: Sanitize HTML
  let htmlClean = sanitizeHtmlContent(htmlRaw);
  
  // Step 2: Remove empty paragraphs
  htmlClean = removeEmptyParagraphs(htmlClean);
  
  // Step 3: Clean HTML structure with rehype
  htmlClean = await cleanHtmlStructure(htmlClean);
  
  // Step 4: Normalize whitespace in text (less aggressive now)
  let textClean = normalizeWhitespace(textRaw);
  
  // Step 5: Join broken lines (less aggressive now)
  textClean = joinBrokenLines(textClean);
  
  // Step 6: Extract clean paragraphs
  const paragraphsClean = extractParagraphs(htmlClean);
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[Format Repair] Final paragraph count:', paragraphsClean.length);
  }
  
  return {
    html_clean: htmlClean,
    text_clean: textClean,
    paragraphs_clean: paragraphsClean
  };
}

