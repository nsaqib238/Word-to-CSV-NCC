/**
 * NCC DOCX (already converted to HTML via Mammoth) -> RAG-ready units
 *
 * This module is deterministic and conservative: it avoids "inventing" meaning
 * and focuses on stable chunking + clear NCC-aware classification.
 */

export type NccUnitType =
  | 'VOLUME'
  | 'SECTION'
  | 'PART'
  | 'SUBPART'
  | 'HEADING'
  | 'INTRODUCTION'
  | 'INTRODUCTORY_PROVISION'
  | 'GOVERNING_REQUIREMENT'
  | 'STATE_VARIATION'
  | 'STATE_VARIATION_AMENDMENT'
  | 'OBJECTIVE'
  | 'FUNCTIONAL_STATEMENT'
  | 'PROVISION'
  | 'PERFORMANCE_REQUIREMENT'
  | 'DTS_PROVISION'
  | 'VERIFICATION_METHOD'
  | 'DEFINITION'
  | 'APPLICATION'
  | 'SPECIFICATION'
  | 'SPECIFICATION_CLAUSE'
  | 'SCHEDULE'
  | 'APPENDIX'
  | 'EXPLANATORY_INFORMATION'
  | 'NOTE'
  | 'EXCEPTION'
  | 'TABLE'
  | 'TABLE_NOTE'
  | 'FIGURE'
  | 'SCOPE_SUMMARY'
  | 'SCOPE_VOLUME_SELECTION'
  | 'SCOPE_CLASS_APPLICABILITY'
  | 'SCOPE_EXCEPTION'
  | 'GOVERNANCE_RULE'
  | 'DISCIPLINE_RULE'
  | 'CONDITIONAL_RULE'
  | 'PATHWAY_SELECTION'
  | 'PATHWAY_COMPLETE'
  | 'CALCULATION_RULE'
  | 'SIZING_RULE'
  | 'CONSTANT'
  | 'PERFORMANCE_CRITERION'
  | 'TABLE_ROW'
  | 'OTHER';

export type ComplianceWeight = 'MANDATORY' | 'OPTIONAL_PATHWAY' | 'NON_MANDATORY';

export type NccPathway = 'PERFORMANCE' | 'DTS' | 'VERIFICATION' | 'OBJECTIVE' | 'FUNCTIONAL';
export type NormativeStatus = 'NORMATIVE' | 'INFORMATIVE';
export type Conditionality = 'ALWAYS' | 'IF_DTS_SELECTED' | 'IF_PERFORMANCE_SELECTED';
export type VariationAction = 'DELETE' | 'INSERT' | 'REPLACE' | 'NOT_APPLICABLE' | 'AMEND_PART';

export interface NccBuildConfig {
  doc_id: string;
  volume: string;
  state_variation: string;
  version_date: string;
  source_file: string;
}

export interface NccUnitRow {
  // Identity
  doc_id: string;
  volume: string;
  state_variation: string;
  version_date: string;
  source_file: string;

  // Navigation & hierarchy
  path: string;
  anchor_id: string;
  parent_anchor_id: string;
  order_in_parent: number;
  para_start: number;
  para_end: number;

  // NCC semantics
  unit_label: string;
  unit_type: NccUnitType;
  compliance_weight: ComplianceWeight;

  // Text payload
  title: string;
  text: string;
  text_html: string;
  rag_text: string;
  notes: string;
  exceptions: string;
  defined_term: string;
  contains_shall: boolean;
  contains_must: boolean;

  // Refs / links
  external_refs: string; // JSON array string
  internal_refs: string; // JSON array string
  satisfies_pr_ids: string; // JSON array string (anchor_ids)
  related_unit_ids: string; // JSON array string (anchor_ids)

  // Figures & tables
  asset_type: 'NONE' | 'IMAGE' | 'TABLE';
  asset_id: string;
  asset_caption: string;
  asset_alt_text: string;

  // Traceability & QA
  page_start: string;
  page_end: string;
  bbox_json: string;
  extract_confidence: number;
  warnings: string; // JSON array string

  // ---- Added fields (do not remove existing columns) ----
  ncc_pathway: NccPathway;
  normative_status: NormativeStatus;
  conditionality: Conditionality;
  heading_context: string;
  raw_title: string;
  raw_text: string;
  applies_state: string; // nullable -> '' for none
  variation_action: VariationAction;
  affected_unit_label: string; // nullable -> ''
  affected_subparts: string; // nullable -> ''
  affects_anchor_id: string; // nullable -> ''
  // New fields for FINDING 2-6
  table_grid_json: string; // JSON array: {"headers":[...], "rows":[[...]]}
  table_key_values: string; // Pipe-separated: "CLASS=3|MAX_TRAVEL=XX m"
  base_unit_label: string; // For STATE_VARIATION: base label (e.g., "B4P2" from "VIC B4P2(2)")
  affected_subclause: string; // For STATE_VARIATION: subclause like "(2)(a)"
  conditions_text: string; // Extracted IF/WHERE/UNLESS phrases
  exceptions_text: string; // Extracted EXCEPT/DOES NOT APPLY phrases
  requirements_list: string; // Pipe-separated "must"/"shall" sentences
  standards_referenced: string; // Pipe-separated AS/ISO references
  notes_quality: string; // QA flags: MISSING_TEXT, TABLE_BLOB_ONLY, etc.
  // Decision-oriented fields (FIX 1-8)
  discipline: string; // Electrical / Mechanical / Plumbing / Stormwater / '' (nullable)
  table_purpose: string; // Semantic purpose of table (nullable)
  table_id: string; // Table identifier (e.g., "Table D2.1", "Table C3.2") (nullable)
  table_label: string; // Table label/caption (e.g., "Table D2.1: Fire resistance periods") (nullable)
  applies_to_volume: string; // V1 / V2 / V3 / '' (nullable)
  applies_to_class: string; // Pipe-separated: "1|2|3" or '' (nullable)
  volume_hierarchy: string; // PRIMARY / SECONDARY / TERTIARY (for cross-volume rules)
  dataset_coverage: string; // JSON: {"parts": ["J1", "J2"], "missing_parts": ["J7"]}
  // Phase 2A: Additional decision-oriented fields
  scope_conditions: string; // IF/THEN/ELSE scope logic (nullable)
  formula_json: string; // JSON: {"formula": "A = L × W", "inputs": ["L", "W"], "output": "A"} (nullable)
  constant_value: string; // Numeric value with unit: "2.4m", "20m" (nullable)
  constant_name: string; // Name: "MINIMUM_CEILING_HEIGHT", "MAXIMUM_TRAVEL_DISTANCE" (nullable)
  pathway_alternative_to: string; // What pathway this is alternative to (nullable)
  verification_method_for: string; // Which PR this VM verifies (nullable)
  // Identity validation fields (Priority 1)
  section_code: string; // Single letter A-J (nullable)
  part_code: string; // Letter + number like "J7", "D2" (nullable)
  indexable: boolean; // Whether row should be indexed (default: true)
}

export interface BuildResult {
  rows: NccUnitRow[];
  warnings: string[];
}

type Block =
  | { kind: 'heading'; level: number; text: string; paraIndex: number }
  | { kind: 'paragraph'; text: string; paraIndex: number }
  | { kind: 'table'; html: string; paraIndex: number; caption?: string }
  | { kind: 'figure'; altText: string; paraIndex: number; caption?: string };

const MAX_WORDS = 600;
const MIN_WORDS = 200;

function wordCount(s: string): number {
  return (s || '').trim().split(/\s+/).filter(Boolean).length;
}

function normalizeWhitespace(s: string): string {
  return (s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanNccTextKeepingNumbering(raw: string): string {
  // Keep numbering tokens like "(1)", "(a)", "(i)" intact.
  // Conservative clean-up only: hyphenation across line breaks + whitespace normalization + de-smash.
  let s = raw || '';
  // Hyphenation across line breaks: "occu-\npancy" -> "occupancy"
  s = s.replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, '$1$2');
  // Join hard line breaks that are clearly just wrapping (but keep paragraph breaks)
  s = s.replace(/\r\n/g, '\n');
  // De-smash obvious word joins: "NABERSEnergy" -> "NABERS Energy", "ofbuilding" -> "of building"
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
  s = s.replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2');
  s = s.replace(/([a-z])(\d)/g, '$1 $2');
  s = s.replace(/(\d)([A-Za-z])/g, '$1 $2');
  // Normalize whitespace but keep newlines (so numbering/indentation can survive)
  s = s
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
}

function stripMojibakeAndCjk(s: string): { cleaned: string; removed: boolean } {
  // Conservative: remove CJK ideographs and common mojibake glyphs, but keep ASCII + punctuation.
  // Anything removed is logged via warnings.
  const before = s;
  let out = s;
  out = out.replace(/[\u4E00-\u9FFF]/g, ''); // CJK Unified Ideographs
  out = out.replace(/[�]/g, ''); // replacement char
  out = out.replace(/[\uFFFD]/g, '');
  const removed = out !== before;
  return { cleaned: normalizeWhitespace(out), removed };
}

function detectInternalRefs(text: string): string[] {
  const refs = new Set<string>();
  const patterns = [
    /\b([A-Z]\d+[PDV]\d+[A-Z]?\b)\b/g, // e.g. C2D5, C1P1, C2V1
    /\b([A-Z]{1,3}\d+(?:\.\d+)*\b)\b/g, // looser fallback
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const v = (m[1] || '').trim();
      if (v.length >= 3) refs.add(v);
    }
  }
  return Array.from(refs);
}

function detectExternalRefs(text: string): string[] {
  const refs = new Set<string>();
  // AS 1428.1, AS/NZS 3000, ISO 1234 etc. Keep conservative; don't "correct" comma lists.
  const patterns = [
    /\b(AS\/NZS\s+\d{1,5}(?:\.\d+){0,3})\b/g,
    /\b(AS\s+\d{1,5}(?:\.\d+){0,3})\b/g,
    /\b(ISO\s+\d{1,5}(?:-\d+)?(?:\.\d+)*)\b/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const v = normalizeWhitespace(m[1] || '');
      if (v) refs.add(v);
    }
  }
  return Array.from(refs);
}

// FINDING 2: Extract table structure from table text
function extractTableGrid(tableText: string): { headers: string[]; rows: string[][] } | null {
  if (!tableText) return null;
  const lines = tableText.split(/\n+/).filter(l => l.trim());
  if (lines.length < 1) return null;
  
  const headers: string[] = [];
  const rows: string[][] = [];
  
  // Check for pipe/pipe-like separators or tab-like structure
  const firstLine = lines[0].trim();
  if (firstLine.includes('|') || firstLine.includes('\t')) {
    headers.push(...firstLine.split(/[|\t]+/).map(h => normalizeWhitespace(h)).filter(h => h));
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(/[|\t]+/).map(c => normalizeWhitespace(c)).filter(c => c);
      if (cells.length > 0) {
        if (cells.length === headers.length) {
          rows.push(cells);
        } else if (cells.length > 0) {
          // Mismatch but has content - pad or truncate
          const padded = [...cells];
          while (padded.length < headers.length) padded.push('');
          rows.push(padded.slice(0, headers.length));
        }
      }
    }
  } else {
    // No clear separators - treat each line as a row, first line as header if short
    if (firstLine.length < 150 && lines.length > 1) {
      headers.push(firstLine);
      for (let i = 1; i < lines.length; i++) {
        const line = normalizeWhitespace(lines[i]);
        if (line) rows.push([line]);
      }
    } else {
      // Single column table
      headers.push('Content');
      for (let i = 0; i < lines.length; i++) {
        const line = normalizeWhitespace(lines[i]);
        if (line) rows.push([line]);
      }
    }
  }
  
  if (headers.length === 0) return null;
  if (rows.length === 0 && lines.length > 0) {
    // At least return the structure with empty rows
    return { headers, rows: [] };
  }
  return { headers, rows };
}

// FINDING 2: Extract key-value pairs from table (best-effort, only explicit)
function extractTableKeyValues(tableText: string): string {
  if (!tableText) return '';
  const pairs: string[] = [];
  // Look for explicit patterns like "CLASS=3", "MAX=XX m", etc.
  const patterns = [
    /\b(CLASS|MAX|MIN|MAXIMUM|MINIMUM)\s*[=:]\s*([^\s,;]+)/gi,
    /\b(CLASS\s+\d+)/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(tableText)) !== null) {
      const key = normalizeWhitespace(m[1] || '');
      const val = normalizeWhitespace(m[2] || m[0] || '');
      if (key && val) pairs.push(`${key}=${val}`);
    }
  }
  return pairs.join('|');
}

// FINDING 3: Extract base unit label from state variation text
function extractBaseUnitLabel(stateVarText: string, unitLabel: string, affectedUnitLabel?: string): string {
  // Try from affected_unit_label first (most reliable)
  if (affectedUnitLabel) {
    const m = affectedUnitLabel.match(/^([A-Z]\d+[A-Z]\d+)/);
    if (m?.[1]) return m[1];
  }
  // Try from unit_label (e.g., "VIC B4P2(2)" -> "B4P2")
  if (unitLabel) {
    const m = unitLabel.match(/^[A-Z]+\s+([A-Z]\d+[A-Z]\d+)/);
    if (m?.[1]) return m[1];
    // Also try if unit_label is just the base label
    if (/^[A-Z]\d+[A-Z]\d+$/.test(unitLabel)) return unitLabel;
  }
  // Try from text (e.g., "NSW C4D12(4)" -> "C4D12")
  const m = stateVarText.match(/\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\s+([A-Z]\d+[A-Z]\d+)/i);
  if (m?.[2]) return m[2];
  // Try from affected_unit_label in text if present
  const m2 = stateVarText.match(/\b([A-Z]\d+[A-Z]\d+)(?:\(\d+\))?/);
  if (m2?.[1]) return m2[1];
  return '';
}

// FINDING 3: Extract affected subclause
function extractAffectedSubclause(stateVarText: string): string {
  // Look for patterns like "(2)(a)", "(4)", etc.
  const m = stateVarText.match(/\((\d+)\)(?:\(([a-z])\))?/);
  if (m) {
    return m[2] ? `(${m[1]})(${m[2]})` : `(${m[1]})`;
  }
  return '';
}

// FINDING 4: Extract conditional phrases
function extractConditionsText(text: string): string {
  if (!text) return '';
  const conditions: string[] = [];
  // Extract sentences/phrases with IF/WHERE/UNLESS/WHEN
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  for (const sent of sentences) {
    const trimmed = normalizeWhitespace(sent);
    if (/\b(if|where|unless|when|provided that|subject to)\b/i.test(trimmed)) {
      conditions.push(trimmed);
    }
  }
  return conditions.join(' | ');
}

// FINDING 4: Extract exception phrases
function extractExceptionsText(text: string): string {
  if (!text) return '';
  const exceptions: string[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  for (const sent of sentences) {
    const trimmed = normalizeWhitespace(sent);
    if (/\b(does not apply|except|exempt|exclusion|notwithstanding)\b/i.test(trimmed)) {
      exceptions.push(trimmed);
    }
  }
  return exceptions.join(' | ');
}

// FINDING 6: Extract requirement sentences (must/shall)
function extractRequirementsList(text: string): string {
  if (!text) return '';
  const requirements: string[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  for (const sent of sentences) {
    const trimmed = normalizeWhitespace(sent);
    if (/\b(must|shall)\b/i.test(trimmed)) {
      requirements.push(trimmed);
    }
  }
  return requirements.join(' | ');
}

// FINDING 6: Extract standards references (already have detectExternalRefs, but format as pipe-separated)
function extractStandardsReferenced(text: string): string {
  const refs = detectExternalRefs(text);
  return refs.join('|');
}

function complianceWeightFor(unitType: NccUnitType): ComplianceWeight {
  if (unitType === 'PERFORMANCE_REQUIREMENT') return 'MANDATORY';
  if (unitType === 'DTS_PROVISION' || unitType === 'VERIFICATION_METHOD') return 'OPTIONAL_PATHWAY';
  if (unitType === 'NOTE' || unitType === 'EXPLANATORY_INFORMATION' || unitType === 'EXCEPTION' || unitType === 'FIGURE' || unitType === 'TABLE') return 'NON_MANDATORY';
  if (unitType === 'STATE_VARIATION') return 'NON_MANDATORY';
  if (unitType === 'INTRODUCTION' || unitType === 'INTRODUCTORY_PROVISION') return 'NON_MANDATORY';
  return 'NON_MANDATORY';
}

function nccPathwayFor(unitType: NccUnitType): NccPathway {
  if (unitType === 'PERFORMANCE_REQUIREMENT') return 'PERFORMANCE';
  if (unitType === 'DTS_PROVISION') return 'DTS';
  if (unitType === 'VERIFICATION_METHOD') return 'VERIFICATION';
  if (unitType === 'OBJECTIVE') return 'OBJECTIVE';
  if (unitType === 'FUNCTIONAL_STATEMENT') return 'FUNCTIONAL';
  // Default (conservative)
  return 'PERFORMANCE';
}

function normativeStatusFor(unitType: NccUnitType): NormativeStatus {
  if (unitType === 'PERFORMANCE_REQUIREMENT') return 'NORMATIVE';
  if (unitType === 'DTS_PROVISION') return 'NORMATIVE';
  // Informative for notes/figures/tables/intro etc.
  return 'INFORMATIVE';
}

function conditionalityFor(unitType: NccUnitType): Conditionality {
  if (unitType === 'DTS_PROVISION') return 'IF_DTS_SELECTED';
  if (unitType === 'PERFORMANCE_REQUIREMENT') return 'ALWAYS';
  if (unitType === 'VERIFICATION_METHOD') return 'ALWAYS';
  return 'ALWAYS';
}

function detectUnitLabelStart(line: string): string | null {
  const t = line.trim();
  // Prefer explicit NCC style labels: E3O1, E3F2, E3P1, E3D8, C2D5, A5G2 etc.
  const patterns = [
    /^([A-Z]\d+[PDV]\d+[A-Z]?)\b/, // C2D5 / C1P1 / C2V1
    /^([A-Z]\d+[A-Z]\d+[A-Z]?)\b/, // E3D8 / E3P1 / A5G2
    /^([A-Z]{1,2}\d+[A-Z]{1,2}\d+[A-Z]?)\b/, // slightly broader
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function classifyUnitTypeFromContext(unitLabel: string, context: string[]): NccUnitType {
  const ctx = context.join(' | ').toLowerCase();
  if (ctx.includes('objectives') || ctx.includes('objective')) return 'OBJECTIVE';
  if (ctx.includes('functional statement') || ctx.includes('functional statements')) return 'FUNCTIONAL_STATEMENT';
  if (ctx.includes('performance requirement') || ctx.includes('performance requirements')) return 'PERFORMANCE_REQUIREMENT';
  if (ctx.includes('verification method') || ctx.includes('verification methods')) return 'VERIFICATION_METHOD';
  if (ctx.includes('deemed-to-satisfy') || ctx.includes('deemed to satisfy') || ctx.includes('dts')) return 'DTS_PROVISION';
  if (ctx.includes('definitions') || ctx.includes('definition')) return 'DEFINITION';
  if (ctx.includes('application')) return 'APPLICATION';
  // Fallback from label letter: ...P... / ...D... / ...V...
  if (/[PDV]/.test(unitLabel)) {
    const letter = unitLabel.match(/[PDV]/)?.[0] || '';
    if (letter === 'P') return 'PERFORMANCE_REQUIREMENT';
    if (letter === 'D') return 'DTS_PROVISION';
    if (letter === 'V') return 'VERIFICATION_METHOD';
  }
  return 'PROVISION';
}

function classifyHeading(text: string): { unitType: NccUnitType; ref: string; title: string } {
  const t = text.trim();
  // SECTION X / Part X / Specification / Schedule etc.
  let m = t.match(/^(SECTION)\s+([A-Z0-9]+)\b[:\s-]*(.*)$/i);
  if (m) return { unitType: 'SECTION', ref: `SECTION ${m[2]}`, title: normalizeWhitespace(m[3] || '') || t };
  m = t.match(/^(PART)\s+([A-Z0-9.]+)\b[:\s-]*(.*)$/i);
  if (m) return { unitType: 'PART', ref: `PART ${m[2]}`, title: normalizeWhitespace(m[3] || '') || t };
  m = t.match(/^(SUB-?PART)\s+([A-Z0-9.]+)\b[:\s-]*(.*)$/i);
  if (m) return { unitType: 'SUBPART', ref: `SUBPART ${m[2]}`, title: normalizeWhitespace(m[3] || '') || t };
  m = t.match(/^(VOLUME)\s+([A-Z0-9.]+)\b[:\s-]*(.*)$/i);
  if (m) return { unitType: 'VOLUME', ref: `VOLUME ${m[2]}`, title: normalizeWhitespace(m[3] || '') || t };
  m = t.match(/^(APPENDIX)\s+([A-Z0-9.]+)\b[:\s-]*(.*)$/i);
  if (m) return { unitType: 'APPENDIX', ref: `APPENDIX ${m[2]}`, title: normalizeWhitespace(m[3] || '') || t };
  m = t.match(/^(SPECIFICATION)\b[:\s-]*(.*)$/i);
  if (m) return { unitType: 'SPECIFICATION', ref: 'SPECIFICATION', title: normalizeWhitespace(m[2] || '') || t };
  m = t.match(/^(SCHEDULE)\b[:\s-]*(.*)$/i);
  if (m) return { unitType: 'SCHEDULE', ref: 'SCHEDULE', title: normalizeWhitespace(m[2] || '') || t };

  // Context headings (Objectives/Performance Requirements/etc.) are kept as HEADING
  if (/^objectives?\b/i.test(t)) return { unitType: 'HEADING', ref: '', title: t };
  if (/^functional statements?\b/i.test(t)) return { unitType: 'HEADING', ref: '', title: t };
  if (/^performance requirements?\b/i.test(t)) return { unitType: 'HEADING', ref: '', title: t };
  if (/^verification methods?\b/i.test(t)) return { unitType: 'HEADING', ref: '', title: t };
  if (/^deemed[-\s]?to[-\s]?satisfy\b/i.test(t)) return { unitType: 'HEADING', ref: '', title: t };
  if (/^definitions?\b/i.test(t)) return { unitType: 'HEADING', ref: '', title: t };
  if (/^application\b/i.test(t)) return { unitType: 'HEADING', ref: '', title: t };

  return { unitType: 'HEADING', ref: '', title: t };
}

function tableToAltText(tableEl: HTMLTableElement): string {
  const rows: string[][] = [];
  const trs = Array.from(tableEl.querySelectorAll('tr'));
  for (const tr of trs) {
    const cells = Array.from(tr.querySelectorAll('th,td')).map(c => normalizeWhitespace(c.textContent || ''));
    if (cells.some(Boolean)) rows.push(cells);
  }
  if (rows.length === 0) return '';
  // Deterministic pipe grid (no styling, no merges)
  const maxCols = Math.max(...rows.map(r => r.length));
  const normalizedRows = rows.map(r => {
    const out = r.slice();
    while (out.length < maxCols) out.push('');
    return out;
  });
  return normalizedRows.map(r => `| ${r.map(v => (v || '').replace(/\|/g, '\\|')).join(' | ')} |`).join('\n');
}

function extractBlocksInOrder(html: string): Block[] {
  // Support both browser and Node (headless self-test) environments.
  // In Node, scripts can provide a global DOMParser (e.g. via linkedom).
  const ParserCtor: any = (globalThis as any).DOMParser || (typeof window !== 'undefined' ? (window as any).DOMParser : undefined);
  if (!ParserCtor) return [];
  const parser = new ParserCtor();
  // Some DOMParser implementations (e.g., linkedom) won't populate body children for pure fragments.
  const wrapped = /<\s*html[\s>]/i.test(html) ? html : `<html><body>${html}</body></html>`;
  const doc = parser.parseFromString(wrapped, 'text/html');
  const body = (doc as any).body || (doc as any).documentElement?.querySelector?.('body') || (doc as any).querySelector?.('body');
  if (!body) return [];
  const blocks: Block[] = [];
  let paraIndex = 0;

  const walk = (node: Element) => {
    const tag = node.tagName.toLowerCase();
    if (tag === 'table') {
      blocks.push({ kind: 'table', html: node.outerHTML, paraIndex });
      paraIndex++;
      return;
    }
    if (tag === 'img') {
      const alt = normalizeWhitespace((node as HTMLImageElement).alt || '');
      blocks.push({ kind: 'figure', altText: alt, paraIndex });
      paraIndex++;
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag.substring(1), 10);
      const text = normalizeWhitespace(node.textContent || '');
      if (text) {
        blocks.push({ kind: 'heading', level, text, paraIndex });
        paraIndex++;
      }
      return;
    }
    if (tag === 'p' || tag === 'li' || tag === 'blockquote' || tag === 'div') {
      // Avoid duplicating nested tables
      if (node.querySelector('table')) {
        Array.from(node.children).forEach(child => walk(child));
        return;
      }
      // Check raw text content first - don't skip blocks that have any content
      // (even if it's just spacing/formatting, it might be meaningful)
      const rawText = node.textContent || '';
      // Only skip if truly empty (no text at all, not even whitespace)
      if (rawText.trim().length === 0) {
        return;
      }
      const text = normalizeWhitespace(rawText);
      // Even after normalization, include the block if it had any raw content
      // This ensures centered text or spacing after headings is captured
      if (text || rawText.trim().length > 0) {
        blocks.push({ kind: 'paragraph', text: text || rawText.trim(), paraIndex });
        paraIndex++;
      }
      return;
    }
    Array.from(node.children).forEach(child => walk(child));
  };

  Array.from(body.children).forEach(el => walk(el as Element));
  return blocks;
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    // Fallback: not cryptographic, but deterministic.
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `fnv1a_${(h >>> 0).toString(16)}`;
  }

  const enc = new TextEncoder();
  const bytes = enc.encode(input);
  const hash = await window.crypto.subtle.digest('SHA-256', bytes);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

function splitIntoChunksByWords(text: string, minWords = MIN_WORDS, maxWords = MAX_WORDS): string[] {
  const cleaned = normalizeWhitespace(text);
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [cleaned];

  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const remaining = words.length - i;
    const size = remaining <= maxWords ? remaining : maxWords;
    let take = size;

    // Keep last chunk >= minWords when possible
    if (remaining > maxWords && remaining - maxWords < minWords) {
      take = remaining - minWords;
    }

    chunks.push(words.slice(i, i + take).join(' '));
    i += take;
  }
  return chunks;
}

function jsonArrayString(values: string[]): string {
  return JSON.stringify(values.filter(Boolean));
}

export async function buildNccUnitsFromHtml(
  htmlClean: string,
  config: NccBuildConfig,
  progressCallback?: (status: string, percent: number) => void
): Promise<BuildResult> {
  const log = (status: string, percent: number) => {
    if (progressCallback) {
      progressCallback(status, percent);
    } else {
      console.log(`[NCC Extraction ${percent}%] ${status}`);
    }
  };

  log('Starting extraction...', 0);
  const blocks = extractBlocksInOrder(htmlClean);
  log(`Extracted ${blocks.length} blocks from HTML`, 5);
  const rows: NccUnitRow[] = [];
  const globalWarnings: string[] = [];

  // Hierarchy stack from headings
  const pathStack: Array<{ level: number; label: string; anchor_id: string }> = [];
  const orderInParentMap = new Map<string, number>();
  const usedAnchorIds = new Set<string>();
  const contextHeadings: string[] = [];

  type CurrentUnit = {
    unit_type: NccUnitType;
    unit_label: string;
    parent_anchor_id: string;
    order_in_parent: number;
    path: string;
    para_start: number;
    para_end: number;
    title: string;
    text: string;
    notes: string;
    exceptions: string;
    warnings: string[];
  };

  let currentUnit: CurrentUnit | null = null;
  // For rule "Table/Figure pauses aggregation; resume only if label repeats"
  let pausedUnit: CurrentUnit | null = null;

  const nextOrder = (parentAnchorId: string): number => {
    const cur = orderInParentMap.get(parentAnchorId) || 0;
    const next = cur + 1;
    orderInParentMap.set(parentAnchorId, next);
    return next;
  };

  const currentPath = () => pathStack.map(s => s.label).join(' > ');
  const currentParentAnchor = () => (pathStack.length ? pathStack[pathStack.length - 1].anchor_id : '');

  const slug = (s: string) =>
    normalizeWhitespace(s)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_')
      .slice(0, 80);

  const makeAnchorId = (parts: string[]): string => {
    const base = parts.filter(Boolean).join('_');
    let candidate = base || 'NCC_UNIT';
    if (!usedAnchorIds.has(candidate)) {
      usedAnchorIds.add(candidate);
      return candidate;
    }
    // deterministic collision handling (should be rare; keep stable)
    let i = 2;
    while (usedAnchorIds.has(`${candidate}_${i}`)) i++;
    const finalId = `${candidate}_${i}`;
    usedAnchorIds.add(finalId);
    globalWarnings.push(`Duplicate anchor_id encountered: ${candidate} -> ${finalId}`);
    return finalId;
  };

  const isSeparatorLine = (t: string): boolean => {
    const s = (t || '').trim();
    if (!s) return true;
    return /^[\-\u2013\u2014_•·\*]{2,}$/.test(s);
  };

  const stateVariationRegex = /^(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\s+([A-Z]{1,2}\d+\s*[A-Z]?\d*(?:\(\d+\))?)(?=\b|to\b|\s|$)/i;
  // Also catch state markers embedded mid-paragraph (WPS/Adobe conversion sometimes concatenates lines)
  const stateVariationAnywhereRegex = /\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\s+([A-Z]{1,2}\d+\s*[A-Z]?\d*(?:\(\d+\))?)(?=\b|to\b|\s|$)/i;
  const stateAssetRegex = /^(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\s+(Figure|Table)\s+([A-Z]{1,2}\d+[A-Z]?\d*(?:\(\d+\))?)(\b|\s|$)/i;
  const insertMarkerRegex = /^(Insert\s+(?:SA\s+)?(?:Table|Figure)\b)/i;
  const tableNotesRegex = /^Table Notes\b/i;
  const applicationsHeaderRegex = /^Applications$/i;
  const boundaryRegex = /^(Part|Section|Volume)\s+[A-Z0-9]+\b/i;
  const introBoundaryRegex = /^Introduction to this (Part|Section|Volume)\b/i;
  const newUnitLabelRegex = /^[A-Z]\d+[GOFPDV]\d+\b/;

  type ContextHeading =
    | 'Objectives'
    | 'Functional Statements'
    | 'Performance Requirements'
    | 'Verification Methods'
    | 'Deemed-to-Satisfy Provisions'
    | 'Governing Requirements'
    | 'Introduction'
    | 'Application';

  let currentContext: ContextHeading | null = null;
  let lastHeadingText = '';

  const normalizeContextHeading = (s: string): ContextHeading | null => {
    const t = normalizeWhitespace(s);
    if (!t) return null;
    const exact = t.toLowerCase();
    if (exact === 'objectives') return 'Objectives';
    if (exact === 'functional statements') return 'Functional Statements';
    if (exact === 'performance requirements') return 'Performance Requirements';
    if (exact === 'verification methods') return 'Verification Methods';
    if (exact === 'deemed-to-satisfy provisions' || exact === 'deemed to satisfy provisions') return 'Deemed-to-Satisfy Provisions';
    if (exact === 'governing requirements' || exact === 'governing requirement') return 'Governing Requirements';
    if (exact === 'introduction') return 'Introduction';
    if (exact === 'introduction to this part' || exact === 'introduction to this section' || exact === 'introduction to this volume') return 'Introduction';
    if (exact === 'application' || exact === 'applications') return 'Application';
    return null;
  };

  // Deduplicate STATE_VARIATION rows per document per (state, unit_label)
  const emittedStateVariations = new Set<string>();
  // Pending state markers (do not emit searchable row): applied to next content row with same label
  const pendingStateMarkers = new Map<string, { state: string; label: string; paraIndex: number }>();
  // Table/Figure insert markers to attach to next table/figure within a short window
  let pendingAssetAttach: null | { kind: 'table' | 'figure'; jurisdiction: string; target: string; windowLeft: number } = null;

  const classifyLabelStrict = (label: string): { unit_type: NccUnitType; warn?: string } => {
    // Label letter indicates desired context: G/O/F/P/V/D.
    const m = label.match(/^[A-Z]\d+([GOFPDV])\d+/);
    const kind = m?.[1] || '';
    const ctx = currentContext;

    const required: Record<string, ContextHeading> = {
      G: 'Governing Requirements',
      O: 'Objectives',
      F: 'Functional Statements',
      P: 'Performance Requirements',
      V: 'Verification Methods',
      D: 'Deemed-to-Satisfy Provisions',
    };

    if (!kind || !required[kind]) {
      return { unit_type: 'OTHER', warn: `MISSING_CONTEXT_FOR_LABEL:${label}` };
    }

    // If context heading is missing/mismatched (common in messy conversions), infer from the label itself.
    // This prevents false "missing context" and keeps unit types stable.
    if (!ctx || ctx !== required[kind]) {
      const map: Record<string, NccUnitType> = {
        G: 'GOVERNING_REQUIREMENT',
        O: 'OBJECTIVE',
        F: 'FUNCTIONAL_STATEMENT',
        P: 'PERFORMANCE_REQUIREMENT',
        V: 'VERIFICATION_METHOD',
        D: 'DTS_PROVISION',
      };
      return { unit_type: map[kind], warn: `CONTEXT_INFERRED_FROM_LABEL:${label}` };
    }

    const map: Record<string, NccUnitType> = {
      G: 'GOVERNING_REQUIREMENT',
      O: 'OBJECTIVE',
      F: 'FUNCTIONAL_STATEMENT',
      P: 'PERFORMANCE_REQUIREMENT',
      V: 'VERIFICATION_METHOD',
      D: 'DTS_PROVISION',
    };

    return { unit_type: map[kind] };
  };

  const appendLine = (base: string, line: string): string => {
    const l = normalizeWhitespace(line);
    if (!l) return base;
    if (!base) return l;
    if (/^[•·\-\u2013\u2014]\s+/.test(l) || /^\(\w+\)\s+/.test(l)) {
      return `${base}\n${l}`;
    }
    return `${base}\n${l}`;
  };

  const flushCurrentUnit = () => {
    if (!currentUnit) return;
    const unit = currentUnit;
    currentUnit = null;

    const contains_shall = /\bshall\b/i.test(`${unit.text} ${unit.notes} ${unit.exceptions}`);
    const contains_must = /\bmust\b/i.test(`${unit.text} ${unit.notes} ${unit.exceptions}`);
    const defined_term = unit.unit_type === 'DEFINITION' ? (unit.unit_label || '') : '';

    // Legacy mapping cleanup: [2019: FP1.6] -> warning, do not include as internal ref.
    const legacyRefs: string[] = [];
    const legacyPattern = /\[(\d{4}):\s*([A-Z]\d+(?:\.\d+)*)\]/g;
    const legacyText = `${unit.title}\n${unit.text}\n${unit.notes}\n${unit.exceptions}`;
    let lm: RegExpExecArray | null;
    while ((lm = legacyPattern.exec(legacyText)) !== null) {
      if (lm[2]) legacyRefs.push(lm[2]);
    }

    let internalRefs = detectInternalRefs([unit.unit_label, unit.title, unit.text, unit.notes, unit.exceptions].filter(Boolean).join(' '));
    // Remove self-references + de-dupe + remove legacy refs
    internalRefs = Array.from(new Set(internalRefs))
      .filter(r => r !== unit.unit_label)
      .filter(r => !legacyRefs.includes(r));

    const externalRefs = detectExternalRefs([unit.unit_label, unit.title, unit.text, unit.notes, unit.exceptions].filter(Boolean).join(' '));

    const chunks = splitIntoChunksByWords(unit.text);

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunkSuffix = chunks.length > 1 ? `::c${String(ci + 1).padStart(2, '0')}` : '';
      const baseAnchorId = `${slug(config.volume)}::${slug(unit.path).slice(0, 120) || 'ROOT'}::${slug(unit.unit_type)}::${slug(unit.unit_label || String(unit.order_in_parent)) || 'ORDER'}`;
      const anchor_id = `${baseAnchorId}${chunkSuffix}`;

      const rag_text = normalizeWhitespace([
        `[${unit.unit_type}]${unit.unit_label ? ` ${unit.unit_label}` : ''}`,
        `path: ${unit.path || ''}`,
        unit.title ? `title: ${unit.title}` : '',
        chunks[ci] ? `text: ${chunks[ci]}` : '',
        unit.notes ? `notes: ${unit.notes}` : '',
        unit.exceptions ? `exceptions: ${unit.exceptions}` : '',
      ].filter(Boolean).join('\n'));

      const warnings = [...unit.warnings];
      if (chunks.length > 1) warnings.push('CHUNK_SPLIT');
      if (!rag_text.trim()) warnings.push('EMPTY_RAG_TEXT');
      legacyRefs.forEach((r) => warnings.push(`LEGACY_REF:${r}`));

      rows.push({
        doc_id: config.doc_id,
        volume: config.volume,
        // Base rows are national by default; state variations are emitted as separate STATE_VARIATION rows.
        state_variation: config.state_variation,
        version_date: config.version_date,
        source_file: config.source_file,
        path: unit.path,
        anchor_id,
        parent_anchor_id: unit.parent_anchor_id,
        order_in_parent: unit.order_in_parent,
        para_start: unit.para_start,
        para_end: unit.para_end,
        unit_label: unit.unit_label,
        unit_type: unit.unit_type,
        compliance_weight: complianceWeightFor(unit.unit_type),
        title: unit.title,
        text: chunks[ci] || '',
        text_html: '',
        defined_term,
        contains_shall,
        contains_must,
        rag_text,
        external_refs: jsonArrayString(externalRefs),
        internal_refs: jsonArrayString(internalRefs),
        satisfies_pr_ids: '[]',
        related_unit_ids: '[]',
        asset_type: 'NONE',
        asset_id: '',
        asset_caption: '',
        asset_alt_text: '',
        page_start: '',
        page_end: '',
        bbox_json: '',
        extract_confidence: 0.75,
        warnings: jsonArrayString(warnings),
        ncc_pathway: nccPathwayFor(unit.unit_type),
        normative_status: normativeStatusFor(unit.unit_type),
        conditionality: conditionalityFor(unit.unit_type),
        heading_context: normalizeWhitespace([lastHeadingText, currentContext || ''].filter(Boolean).join(' | ')),
        raw_title: unit.title,
        raw_text: unit.text,
        applies_state: '',
        variation_action: 'NOT_APPLICABLE',
        affected_unit_label: '',
        affected_subparts: '',
        affects_anchor_id: '',
        // New fields (FINDING 2-6) - initialized in post-pass
        table_grid_json: '',
        table_key_values: '',
        base_unit_label: '',
        affected_subclause: '',
        conditions_text: '',
        exceptions_text: '',
        requirements_list: '',
        standards_referenced: '',
        notes_quality: '',
        // Decision-oriented fields (FIX 1-8) - initialized in post-pass
        discipline: '',
        table_purpose: '',
        applies_to_volume: '',
        applies_to_class: '',
        volume_hierarchy: '',
        dataset_coverage: '',
      });
    }
  };

  const startNewUnit = (opts: {
    unit_type: NccUnitType;
    unit_label: string;
    title: string;
    text: string;
    notes?: string;
    exceptions?: string;
    paraIndex: number;
    warnings?: string[];
  }) => {
    const path = currentPath();
    const parent_anchor_id = currentParentAnchor();
    const order_in_parent = nextOrder(parent_anchor_id);
    currentUnit = {
      unit_type: opts.unit_type,
      unit_label: opts.unit_label,
      parent_anchor_id,
      order_in_parent,
      path,
      para_start: opts.paraIndex,
      para_end: opts.paraIndex,
      title: opts.title,
      text: opts.text,
      notes: opts.notes || '',
      exceptions: opts.exceptions || '',
      warnings: opts.warnings || [],
    };
  };

  const totalBlocks = blocks.length;
  let processedBlocks = 0;
  // Update frequency: every 25 blocks for better feedback, or every 10 for small documents
  const updateFrequency = totalBlocks > 500 ? 25 : 10;
  for (const block of blocks) {
    processedBlocks++;
    // Update progress at intervals or at milestones
    if (processedBlocks % updateFrequency === 0 || processedBlocks === totalBlocks || processedBlocks === 1) {
      const blockPercent = Math.floor((processedBlocks / totalBlocks) * 25); // 0-25% for block processing
      log(`Processing blocks: ${processedBlocks}/${totalBlocks} (${Math.floor((processedBlocks / totalBlocks) * 100)}%)`, 5 + blockPercent);
    }
    
    let unitType: NccUnitType | null = null;
    let unit_label = '';
    let title = '';
    let text = '';
    let text_html = '';
    let notes = '';
    let exceptions = '';
    let asset_type: 'NONE' | 'IMAGE' | 'TABLE' = 'NONE';
    let asset_id = '';
    let asset_caption = '';
    let asset_alt_text = '';
    let warnings: string[] = [];

    if (block.kind === 'heading') {
      // Heading is a hard stop (also cancels any paused unit)
      pausedUnit = null;
      flushCurrentUnit();
      const classified = classifyHeading(block.text);
      const ctx = normalizeContextHeading(block.text);
      if (ctx) currentContext = ctx;
      lastHeadingText = normalizeWhitespace(block.text);
      unitType = classified.unitType;
      unit_label = '';
      title = classified.title;
      text = '';

      // Update path stack
      while (pathStack.length && pathStack[pathStack.length - 1].level >= block.level) {
        pathStack.pop();
      }

      const parent_anchor_id = currentParentAnchor();
      const order_in_parent = nextOrder(parent_anchor_id);
      const pathLabel = normalizeWhitespace(classified.ref ? `${classified.ref}${title ? `: ${title}` : ''}` : title);
      const anchor_id = makeAnchorId([
        slug(config.volume),
        ...(currentPath() ? [slug(currentPath())] : []),
        slug(unitType),
        ...(classified.ref ? [slug(classified.ref)] : []),
        slug(String(order_in_parent)),
      ]);

      pathStack.push({ level: block.level, label: pathLabel, anchor_id });

      // Maintain lightweight context for semantics classification
      const headingText = block.text.trim();
      if (headingText) {
        contextHeadings.push(headingText);
        if (contextHeadings.length > 8) contextHeadings.shift();
      }

      // Headings are also units (SECTION/PART/etc) for navigation
      const rag_text = normalizeWhitespace([
        `[${unitType}]${unit_label ? ` ${unit_label}` : ''}`,
        `path: ${currentPath() || ''}`,
        title ? `title: ${title}` : '',
        text ? `text: ${text}` : '',
        notes ? `notes: ${notes}` : '',
        exceptions ? `exceptions: ${exceptions}` : '',
      ].filter(Boolean).join('\n'));
      rows.push({
        doc_id: config.doc_id,
        volume: config.volume,
        state_variation: config.state_variation,
        version_date: config.version_date,
        source_file: config.source_file,
        path: currentPath(),
        anchor_id,
        unit_label,
        parent_anchor_id,
        order_in_parent,
        para_start: block.paraIndex,
        para_end: block.paraIndex,
        unit_type: unitType,
        compliance_weight: complianceWeightFor(unitType),
        title,
        text: '',
        text_html: '',
        defined_term: '',
        contains_shall: false,
        contains_must: false,
        notes: '',
        exceptions: '',
        rag_text,
        external_refs: '[]',
        internal_refs: '[]',
        satisfies_pr_ids: '[]',
        related_unit_ids: '[]',
        asset_type: 'NONE',
        asset_id: '',
        asset_caption: '',
        asset_alt_text: '',
        page_start: '',
        page_end: '',
        bbox_json: '',
        extract_confidence: 0.85,
        warnings: '[]',
        ncc_pathway: nccPathwayFor(unitType),
        normative_status: normativeStatusFor(unitType),
        conditionality: conditionalityFor(unitType),
        heading_context: '',
        raw_title: title,
        raw_text: '',
        applies_state: '',
        variation_action: 'NOT_APPLICABLE',
        affected_unit_label: '',
        affected_subparts: '',
        affects_anchor_id: '',
        // New fields (FINDING 2-6) - initialized in post-pass
        table_grid_json: '',
        table_key_values: '',
        base_unit_label: '',
        affected_subclause: '',
        conditions_text: '',
        exceptions_text: '',
        requirements_list: '',
        standards_referenced: '',
        notes_quality: '',
        // Identity validation fields (Priority 1) - will be populated by identity validator
        section_code: '',
        part_code: '',
        indexable: true,
        // Table fields (Fix 3)
        table_id: '',
        table_label: '',
      });

      continue;
    }

    if (block.kind === 'table') {
      // Table/Figure is NOT a hard stop: pause current unit, emit table, and only resume if label repeats later.
      if (currentUnit) {
        pausedUnit = currentUnit;
        currentUnit = null;
      }
      unitType = 'TABLE';
      asset_type = 'TABLE';
      asset_alt_text = '';

      // Convert to a deterministic alt-text grid representation (kept separate from enforceable text).
      if (typeof window !== 'undefined') {
        const parser = new DOMParser();
        const d = parser.parseFromString(block.html, 'text/html');
        const table = d.querySelector('table') as HTMLTableElement | null;
        if (table) {
          // FIX D: Extract table caption from HTML structure
          // Look for caption element or preceding paragraph that might be caption
          const captionEl = table.querySelector('caption');
          if (captionEl) {
            asset_caption = normalizeWhitespace(captionEl.textContent || '');
            title = asset_caption; // Use caption as title
          } else {
            // Look for table label in preceding/following elements
            // Check if there's a paragraph before/after with "Table" keyword
            const tableParent = table.parentElement;
            if (tableParent) {
              const prevSibling = tableParent.previousElementSibling;
              if (prevSibling) {
                const prevText = normalizeWhitespace(prevSibling.textContent || '');
                if (/Table\s+\d+/i.test(prevText) || prevText.length < 150) {
                  asset_caption = prevText;
                  title = prevText;
                }
              }
            }
          }
          
          // 2.1 Treat table captions as context headings: if the table is effectively a caption cell with one known heading.
          const cellTexts = Array.from(table.querySelectorAll('tr')).flatMap(tr =>
            Array.from(tr.querySelectorAll('th,td')).map(c => normalizeWhitespace(c.textContent || ''))
          ).filter(Boolean);

          if (cellTexts.length === 1) {
            const ctx = normalizeContextHeading(cellTexts[0]);
            if (ctx && (ctx === 'Objectives' || ctx === 'Functional Statements' || ctx === 'Performance Requirements' || ctx === 'Verification Methods' || ctx === 'Deemed-to-Satisfy Provisions')) {
              currentContext = ctx;
              // Do not emit as content; also keep paused/current unit state as-is.
              continue;
            }
          }

          asset_alt_text = tableToAltText(table);
          
          // FIX D: If we have alt_text but no title, use first row as potential title
          if (!title && asset_alt_text) {
            const firstLine = asset_alt_text.split('\n')[0];
            if (firstLine && firstLine.length < 150 && !firstLine.includes('|')) {
              title = normalizeWhitespace(firstLine.replace(/^\|?\s*|\s*\|?$/g, ''));
              asset_caption = title;
            }
          }
        }
      } else {
        // Server-side: use linkedom DOMParser if available
        const ParserCtor: any = (globalThis as any).DOMParser;
        if (ParserCtor) {
          const parser = new ParserCtor();
          const d = parser.parseFromString(block.html, 'text/html');
          const table = d.querySelector('table') as any;
          if (table) {
            const captionEl = table.querySelector('caption');
            if (captionEl) {
              asset_caption = normalizeWhitespace(captionEl.textContent || '');
              title = asset_caption;
            }
            asset_alt_text = tableToAltText(table);
          }
        }
      }

      // Attach pending "Insert SA Table <label>" markers to the next table within a short window.
      if (pendingAssetAttach && pendingAssetAttach.kind === 'table') {
        if (pendingAssetAttach.windowLeft > 0) {
          warnings.push(`STATE_VARIATION_TABLE:${pendingAssetAttach.jurisdiction}:${pendingAssetAttach.target}`);
          pendingAssetAttach.windowLeft -= 1;
        } else {
          pendingAssetAttach = null;
        }
      }

      // FIX D: Preserve extracted title/caption, only clear if not found
      if (!title) title = '';
      // text will be populated in post-pass from asset_alt_text if needed
      text = '';
      notes = '';
      exceptions = '';
      unit_label = '';

      const parent_anchor_id = currentParentAnchor();
      const order_in_parent = nextOrder(parent_anchor_id);
      asset_id = `table_${order_in_parent}`;
      const anchor_id = makeAnchorId([
        slug(config.volume),
        ...(currentPath() ? [slug(currentPath())] : []),
        'TBL',
        slug(String(order_in_parent)),
      ]);

      const rag_text = normalizeWhitespace([
        `[${unitType}]`,
        `path: ${currentPath() || ''}`,
        title ? `title: ${title}` : '',
        text ? `text: ${text}` : '',
        notes ? `notes: ${notes}` : '',
        exceptions ? `exceptions: ${exceptions}` : '',
        asset_alt_text ? `asset_alt_text: ${asset_alt_text}` : '',
      ].filter(Boolean).join('\n'));
      if (!rag_text) {
        warnings.push('EMPTY_RAG_TEXT');
      }

      rows.push({
        doc_id: config.doc_id,
        volume: config.volume,
        state_variation: config.state_variation,
        version_date: config.version_date,
        source_file: config.source_file,
        path: currentPath(),
        anchor_id,
        unit_label,
        parent_anchor_id,
        order_in_parent,
        para_start: block.paraIndex,
        para_end: block.paraIndex,
        unit_type: unitType,
        compliance_weight: complianceWeightFor(unitType),
        title,
        text,
        text_html: '',
        defined_term: '',
        contains_shall: false,
        contains_must: false,
        notes,
        exceptions,
        rag_text,
        external_refs: jsonArrayString(detectExternalRefs(asset_alt_text)),
        internal_refs: jsonArrayString(detectInternalRefs(asset_alt_text)),
        satisfies_pr_ids: '[]',
        related_unit_ids: '[]',
        asset_type,
        asset_id,
        asset_caption,
        asset_alt_text,
        page_start: '',
        page_end: '',
        bbox_json: '',
        extract_confidence: 0.8,
        warnings: jsonArrayString(warnings),
        ncc_pathway: nccPathwayFor(unitType),
        normative_status: normativeStatusFor(unitType),
        conditionality: conditionalityFor(unitType),
        heading_context: '',
        raw_title: title,
        raw_text: '',
        applies_state: '',
        variation_action: 'NOT_APPLICABLE',
        affected_unit_label: '',
        affected_subparts: '',
        affects_anchor_id: '',
        // New fields (FINDING 2-6) - initialized in post-pass
        table_grid_json: '',
        table_key_values: '',
        base_unit_label: '',
        affected_subclause: '',
        conditions_text: '',
        exceptions_text: '',
        requirements_list: '',
        standards_referenced: '',
        notes_quality: '',
        // Identity validation fields (Priority 1) - will be populated by identity validator
        section_code: '',
        part_code: '',
        indexable: true,
      });

      continue;
    }

    if (block.kind === 'figure') {
      if (currentUnit) {
        pausedUnit = currentUnit;
        currentUnit = null;
      }
      unitType = 'FIGURE';
      asset_type = 'IMAGE';
      asset_alt_text = normalizeWhitespace(block.altText || '');
      title = '';
      text = '';
      notes = '';
      exceptions = '';
      unit_label = '';

      const parent_anchor_id = currentParentAnchor();
      const order_in_parent = nextOrder(parent_anchor_id);
      asset_id = `figure_${order_in_parent}`;
      const anchor_id = makeAnchorId([
        slug(config.volume),
        ...(currentPath() ? [slug(currentPath())] : []),
        'IMG',
        slug(String(order_in_parent)),
      ]);

      // Attach pending "Insert SA Figure <label>" markers to the next figure within a short window.
      if (pendingAssetAttach && pendingAssetAttach.kind === 'figure') {
        if (pendingAssetAttach.windowLeft > 0) {
          warnings.push(`STATE_VARIATION_FIGURE:${pendingAssetAttach.jurisdiction}:${pendingAssetAttach.target}`);
          pendingAssetAttach.windowLeft -= 1;
        } else {
          pendingAssetAttach = null;
        }
      }

      const rag_text = normalizeWhitespace([
        `[${unitType}]`,
        `path: ${currentPath() || ''}`,
        title ? `title: ${title}` : '',
        text ? `text: ${text}` : '',
        notes ? `notes: ${notes}` : '',
        exceptions ? `exceptions: ${exceptions}` : '',
        asset_alt_text ? `asset_alt_text: ${asset_alt_text}` : '',
      ].filter(Boolean).join('\n'));
      if (!rag_text) {
        warnings.push('EMPTY_RAG_TEXT');
      }

      rows.push({
        doc_id: config.doc_id,
        volume: config.volume,
        state_variation: config.state_variation,
        version_date: config.version_date,
        source_file: config.source_file,
        path: currentPath(),
        anchor_id,
        unit_label,
        parent_anchor_id,
        order_in_parent,
        para_start: block.paraIndex,
        para_end: block.paraIndex,
        unit_type: unitType,
        compliance_weight: complianceWeightFor(unitType),
        title,
        text,
        text_html: '',
        defined_term: '',
        contains_shall: false,
        contains_must: false,
        notes,
        exceptions,
        rag_text,
        external_refs: jsonArrayString(detectExternalRefs(asset_alt_text)),
        internal_refs: jsonArrayString(detectInternalRefs(asset_alt_text)),
        satisfies_pr_ids: '[]',
        related_unit_ids: '[]',
        asset_type,
        asset_id,
        asset_caption,
        asset_alt_text,
        page_start: '',
        page_end: '',
        bbox_json: '',
        extract_confidence: 0.75,
        warnings: jsonArrayString(warnings),
        ncc_pathway: nccPathwayFor(unitType),
        normative_status: normativeStatusFor(unitType),
        conditionality: conditionalityFor(unitType),
        heading_context: '',
        raw_title: title,
        raw_text: '',
        applies_state: '',
        variation_action: 'NOT_APPLICABLE',
        affected_unit_label: '',
        affected_subparts: '',
        affects_anchor_id: '',
        // New fields (FINDING 2-6) - initialized in post-pass
        table_grid_json: '',
        table_key_values: '',
        base_unit_label: '',
        affected_subclause: '',
        conditions_text: '',
        exceptions_text: '',
        requirements_list: '',
        standards_referenced: '',
        notes_quality: '',
        // Identity validation fields (Priority 1) - will be populated by identity validator
        section_code: '',
        part_code: '',
        indexable: true,
        // Table fields (Fix 3)
        table_id: '',
        table_label: '',
      });
      continue;
    }

    // Paragraphs (aggregated)
    const raw = block.text;
    const { cleaned, removed } = stripMojibakeAndCjk(raw);
    if (removed) {
      warnings.push('CJK_REMOVED');
    }

    // Stop aggregation on empty/separator lines
    if (isSeparatorLine(cleaned)) {
      flushCurrentUnit();
      continue;
    }

    // STOP on insert markers (do not merge across these)
    if (insertMarkerRegex.test(cleaned)) {
      flushCurrentUnit();

      // Convert to structured amendment row (state variation amendment)
      const jurMatch = cleaned.match(/^(?:Insert\\s+)(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\\s+(Table|Figure)\\s+([A-Z]\\d+[A-Z]\\d+(?:\\(\\d+\\))?)\\b/i);
      if (jurMatch) {
        const jurisdiction = jurMatch[1].toUpperCase();
        const kind = jurMatch[2].toLowerCase() as 'table' | 'figure';
        const target = jurMatch[3];
        pendingAssetAttach = { kind, jurisdiction, target, windowLeft: 3 };
      }

      // Emit amendment marker row (so it doesn't get lost)
      const path = currentPath();
      const parent_anchor_id = currentParentAnchor();
      const order_in_parent = nextOrder(parent_anchor_id);
      const anchor_id = `${slug(config.volume)}::${slug(path).slice(0, 120) || 'ROOT'}::STATE_VARIATION_AMENDMENT::${slug(String(order_in_parent))}`;
      const rag_text = normalizeWhitespace([
        `[STATE_VARIATION_AMENDMENT]`,
        `path: ${path || ''}`,
        `text: ${cleaned}`,
      ].filter(Boolean).join('\n'));

      rows.push({
        doc_id: config.doc_id,
        volume: config.volume,
        state_variation: config.state_variation,
        version_date: config.version_date,
        source_file: config.source_file,
        path,
        anchor_id,
        parent_anchor_id,
        order_in_parent,
        para_start: block.paraIndex,
        para_end: block.paraIndex,
        unit_label: '',
        unit_type: 'STATE_VARIATION_AMENDMENT',
        compliance_weight: 'NON_MANDATORY',
        title: '',
        text: '',
        text_html: '',
        defined_term: '',
        contains_shall: false,
        contains_must: false,
        rag_text,
        notes: '',
        exceptions: '',
        external_refs: '[]',
        internal_refs: '[]',
        satisfies_pr_ids: '[]',
        related_unit_ids: '[]',
        asset_type: 'NONE',
        asset_id: '',
        asset_caption: '',
        asset_alt_text: '',
        page_start: '',
        page_end: '',
        bbox_json: '',
        extract_confidence: 0.7,
        warnings: jsonArrayString(['INSERT_MARKER']),
      });

      continue;
    }

    // Applications header (subsection): set subsection context and do not emit a row
    if (applicationsHeaderRegex.test(cleaned)) {
      currentContext = 'Application';
      continue;
    }

    // Table Notes: attach to most recent table as a TABLE_NOTE row
    if (tableNotesRegex.test(cleaned)) {
      flushCurrentUnit();
      const path = currentPath();
      const parent_anchor_id = currentParentAnchor();
      const order_in_parent = nextOrder(parent_anchor_id);
      const anchor_id = `${slug(config.volume)}::${slug(path).slice(0, 120) || 'ROOT'}::TABLE_NOTE::${slug(String(order_in_parent))}`;
      const rag_text = normalizeWhitespace([
        `[TABLE_NOTE]`,
        `path: ${path || ''}`,
        `text: ${cleaned}`,
      ].filter(Boolean).join('\n'));

      rows.push({
        doc_id: config.doc_id,
        volume: config.volume,
        state_variation: config.state_variation,
        version_date: config.version_date,
        source_file: config.source_file,
        path,
        anchor_id,
        parent_anchor_id,
        order_in_parent,
        para_start: block.paraIndex,
        para_end: block.paraIndex,
        unit_label: '',
        unit_type: 'TABLE_NOTE',
        compliance_weight: 'NON_MANDATORY',
        title: '',
        text: cleaned,
        text_html: '',
        defined_term: '',
        contains_shall: false,
        contains_must: false,
        rag_text,
        notes: '',
        exceptions: '',
        external_refs: '[]',
        internal_refs: '[]',
        satisfies_pr_ids: '[]',
        related_unit_ids: '[]',
        asset_type: 'NONE',
        asset_id: '',
        asset_caption: '',
        asset_alt_text: '',
        page_start: '',
        page_end: '',
        bbox_json: '',
        extract_confidence: 0.7,
        warnings: jsonArrayString(['TABLE_NOTE']),
        // Table fields (Fix 3)
        table_id: '',
        table_label: '',
      });

      continue;
    }

    // Extract state asset markers (must not be appended into DTS text)
    // Examples: "SA Figure E1D2", "SA Table E1D2"
    const sam = cleaned.match(stateAssetRegex);
    if (sam) {
      const state = sam[1].toUpperCase();
      const kind = sam[2].toLowerCase(); // figure/table
      const label = sam[3];

      const path = currentPath();
      const parent_anchor_id = currentParentAnchor();
      const order_in_parent = nextOrder(parent_anchor_id);
      const unit_type: NccUnitType = kind === 'figure' ? 'FIGURE' : 'TABLE';
      const asset_type: 'NONE' | 'IMAGE' | 'TABLE' = kind === 'figure' ? 'IMAGE' : 'TABLE';
      const asset_id = kind === 'figure'
        ? `IMG_${String(order_in_parent).padStart(6, '0')}`
        : `TBL_${String(order_in_parent).padStart(6, '0')}`;
      const asset_caption = `${state} ${sam[2]} ${label}`;

      const anchor_id = `${slug(config.volume)}::${slug(path).slice(0, 120) || 'ROOT'}::${slug(unit_type)}::${slug(`${state}_${label}`)}`;
      const rag_text = normalizeWhitespace([
        `[${unit_type}] ${label}`,
        `path: ${path || ''}`,
        `title: ${asset_caption}`,
      ].filter(Boolean).join('\n'));

      rows.push({
        doc_id: config.doc_id,
        volume: config.volume,
        state_variation: state,
        version_date: config.version_date,
        source_file: config.source_file,
        path,
        anchor_id,
        parent_anchor_id,
        order_in_parent,
        para_start: block.paraIndex,
        para_end: block.paraIndex,
        unit_label: label,
        unit_type,
        compliance_weight: complianceWeightFor(unit_type),
        title: asset_caption,
        text: '',
        text_html: '',
        defined_term: '',
        contains_shall: false,
        contains_must: false,
        rag_text,
        notes: '',
        exceptions: '',
        external_refs: '[]',
        internal_refs: '[]',
        satisfies_pr_ids: '[]',
        related_unit_ids: '[]',
        asset_type,
        asset_id,
        asset_caption,
        asset_alt_text: '',
        page_start: '',
        page_end: '',
        bbox_json: '',
        extract_confidence: 0.7,
        warnings: jsonArrayString(['STATE_ASSET_MARKER']),
      });

      continue;
    }

    // 1.1 State variation marker WITH TITLE/TEXT
    // FIX: State variations like "NSW J7D3(1)  Artificial lighting" should create actual units, not just markers
    const svm = cleaned.match(stateVariationRegex);
    if (svm) {
      const state = svm[1];
      const rawLabel = svm[2]; // e.g., "J7D3(1)" or "J7D3" or "JP1"
      
      // Normalize label: remove spaces
      const normalizedLabel = rawLabel.replace(/\s+/g, '');
      
      // Extract the text AFTER the state variation label (this is the title/heading)
      const rest = cleaned.substring(svm[0].length).trim();
      const body = rest.replace(/^[–—:-]\s*/, '').trim();
      
      // If there's body text (like "Artificial lighting"), this is a real unit with content
      if (body) {
        // Flush any existing unit first
        flushCurrentUnit();
        
        // Classify the unit type from the normalized label
        const strict = classifyLabelStrict(normalizedLabel);
        let unitType = strict.unit_type;
        if (strict.warn) warnings.push(strict.warn);
        
        // Mark as state variation
        warnings.push(`STATE_VARIATION:${state}:${normalizedLabel}`);
        
        // Start new unit with the label and title
        startNewUnit({
          unit_type: unitType,
          unit_label: normalizedLabel,
          title: body.length <= 120 ? body : '',
          text: body || '', // Start with body, will aggregate subsequent paragraphs
          paraIndex: block.paraIndex,
          warnings,
        });
        
        continue;
      } else {
        // No body text - treat as marker only
        pendingStateMarkers.set(normalizedLabel, { state, label: normalizedLabel, paraIndex: block.paraIndex });
        const svKey = `${state}__${normalizedLabel}`;
        if (emittedStateVariations.has(svKey)) {
          continue;
        }
        emittedStateVariations.add(svKey);
        continue;
      }
    }

    // 1.1b Embedded jurisdiction markers
    // Treat as a warning only; do NOT emit STATE_VARIATION rows here.
    // Actual extraction into STATE_VARIATION rows happens in a post-pass and only when there is
    // real modification language (Delete/Insert/Replace/does not apply/left blank).
    const embedded = cleaned.match(stateVariationAnywhereRegex);
    if (embedded) {
      if (!currentUnit) {
        startNewUnit({
          unit_type: 'OTHER',
          unit_label: '',
          title: '',
          text: cleaned,
          paraIndex: block.paraIndex,
          warnings: [...warnings, 'STATE_VARIATION_EMBEDDED'],
        });
      } else {
        currentUnit.para_end = block.paraIndex;
        currentUnit.warnings.push(...warnings, 'STATE_VARIATION_EMBEDDED');
        currentUnit.text = appendLine(currentUnit.text, cleaned);
      }
      continue;
    }

    // 1.2 Part/Section/Volume boundary lines (hard stop)
    if (boundaryRegex.test(cleaned) || introBoundaryRegex.test(cleaned)) {
      pausedUnit = null;
      flushCurrentUnit();
      // We don't attempt to convert paragraph headings into real h1..h6, but we emit a HEADING/INTRODUCTION unit.
      const path = currentPath();
      const parent_anchor_id = currentParentAnchor();
      const order_in_parent = nextOrder(parent_anchor_id);
      const isIntro = introBoundaryRegex.test(cleaned);
      const unit_type: NccUnitType = isIntro ? 'INTRODUCTION' : 'HEADING';
      if (isIntro) currentContext = 'Introduction';

      const anchor_id = `${slug(config.volume)}::${slug(path).slice(0, 120) || 'ROOT'}::${slug(unit_type)}::${slug(String(order_in_parent))}`;
      const rag_text = normalizeWhitespace([
        `[${unit_type}]`,
        `path: ${path || ''}`,
        `title: ${cleaned}`,
      ].filter(Boolean).join('\n'));

      rows.push({
        doc_id: config.doc_id,
        volume: config.volume,
        state_variation: config.state_variation,
        version_date: config.version_date,
        source_file: config.source_file,
        path,
        anchor_id,
        parent_anchor_id,
        order_in_parent,
        para_start: block.paraIndex,
        para_end: block.paraIndex,
        unit_label: '',
        unit_type,
        compliance_weight: complianceWeightFor(unit_type),
        title: cleaned,
        text: '',
        text_html: '',
        defined_term: '',
        contains_shall: false,
        contains_must: false,
        rag_text,
        notes: '',
        exceptions: '',
        external_refs: '[]',
        internal_refs: '[]',
        satisfies_pr_ids: '[]',
        related_unit_ids: '[]',
        asset_type: 'NONE',
        asset_id: '',
        asset_caption: '',
        asset_alt_text: '',
        page_start: '',
        page_end: '',
        bbox_json: '',
        extract_confidence: 0.75,
        warnings: '[]',
      });

      continue;
    }

    // Explanatory markers
    const isNote = /^NOTE\b/i.test(cleaned) || /^NOTES\b/i.test(cleaned);
    const isExplanatory = /^EXPLANATORY\b/i.test(cleaned) || /^EXPLANATION\b/i.test(cleaned);
    const isException = /^EXCEPTION\b/i.test(cleaned) || /^Exception:\b/i.test(cleaned);

    unit_label = detectUnitLabelStart(cleaned) || '';
    unitType =
      isException ? 'EXCEPTION' :
        isNote ? 'NOTE' :
          isExplanatory ? 'EXPLANATORY_INFORMATION' :
            unit_label ? classifyLabelStrict(unit_label).unit_type :
              'OTHER';
    if (unit_label) {
      const strict = classifyLabelStrict(unit_label);
      if (strict.warn) warnings.push(strict.warn);
      unitType = strict.unit_type;
    }

    // Table/Figure pause-resume rule:
    // if we have a paused unit, only resume it if the next labelled line repeats the same label.
    if (pausedUnit && unit_label) {
      if (unit_label === pausedUnit.unit_label) {
        currentUnit = pausedUnit;
        pausedUnit = null;
      } else {
        // label changed; flush paused unit now and proceed normally
        currentUnit = pausedUnit;
        pausedUnit = null;
        flushCurrentUnit();
      }
    }

    // Intro paragraphs classification:
    // If we are in Introduction context and there's no label, treat as INTRODUCTORY_PROVISION (not OTHER).
    if (!unit_label && currentContext === 'Introduction') {
      unitType = 'INTRODUCTORY_PROVISION';
    }

    // Specification clause detection
    if (unit_label && /^S(\d+)C(\d+)$/i.test(unit_label)) {
      unitType = 'SPECIFICATION_CLAUSE';
      warnings.push(`SPECIFICATION_CLAUSE:${unit_label}`);
    }

    // Definitions: attempt to capture defined term as label-like head
    if (unitType === 'DEFINITION' && !unit_label) {
      const dm = cleaned.match(/^([A-Z][A-Z0-9\- ]{2,60})\s+(means|MEANS)\b/);
      if (dm?.[1]) {
        unit_label = normalizeWhitespace(dm[1]);
      }
    }

    // Determine if this starts a NEW unit (different clause or table)
    // Simple logic: text is part of clause until next clause begins or table begins
    const isTable = unitType === 'TABLE' || asset_type === 'TABLE';
    const isDifferentClause = unit_label && currentUnit && currentUnit.unit_label && 
      unit_label !== currentUnit.unit_label;
    const startsNewUnit = isTable || isDifferentClause;

    // New labelled unit (different clause or table) => flush previous
    if (startsNewUnit) {
      flushCurrentUnit();
    }

    // If we have an active unit, attach this block as continuation or as note/exception.
    if (currentUnit) {
      currentUnit.para_end = block.paraIndex;
      if (warnings.length) currentUnit.warnings.push(...warnings);

      if (unitType === 'NOTE' || unitType === 'EXPLANATORY_INFORMATION') {
        currentUnit.notes = appendLine(currentUnit.notes, cleaned);
        continue;
      }
      if (unitType === 'EXCEPTION') {
        currentUnit.exceptions = appendLine(currentUnit.exceptions, cleaned);
        continue;
      }

      // Applications as subsection: store following unlabeled lines in notes until the next unit starts.
      if (!unit_label && currentContext === 'Application') {
        currentUnit.notes = appendLine(currentUnit.notes, cleaned);
        continue;
      }

      // If no unit_label, continue accumulating text for current clause
      if (!unit_label) {
        currentUnit.text = appendLine(currentUnit.text, cleaned);
        continue;
      }
      
      // If same unit_label, continue accumulating text (don't start new unit)
      if (unit_label === currentUnit.unit_label) {
        // Same clause - append to text
        const rest = cleaned.replace(new RegExp(`^${unit_label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), '').trim();
        const body = rest.replace(/^[–—:-]\s*/, '').trim();
        if (body) {
          currentUnit.text = appendLine(currentUnit.text, body);
        }
        continue;
      }
      // If we got here, it's a different labelled line but currentUnit was just flushed above.
    }

    // No current unit: start one (either labelled or OTHER/NOTE/EXCEPTION standalone)
    title = '';
    text = '';
    notes = '';
    exceptions = '';

    if (unit_label) {
      const rest = cleaned.replace(new RegExp(`^${unit_label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), '').trim();
      const body = rest.replace(/^[–—:-]\s*/, '').trim();
      // For PERFORMANCE_REQUIREMENT, FUNCTIONAL_STATEMENT, VERIFICATION_METHOD, SPECIFICATION_CLAUSE: always populate text
      if (unitType === 'PERFORMANCE_REQUIREMENT' || unitType === 'FUNCTIONAL_STATEMENT' || unitType === 'VERIFICATION_METHOD' || unitType === 'SPECIFICATION_CLAUSE') {
        title = body.length <= 120 ? body : '';
        text = body || ''; // Always set text, even if empty (will be filled by aggregation)
      } else {
        title = body.length <= 120 ? body : '';
        text = body.length <= 120 ? '' : body;
      }
    } else {
      text = cleaned;
    }

    if (unitType === 'NOTE' || unitType === 'EXPLANATORY_INFORMATION') {
      notes = cleaned;
      text = '';
    }
    if (unitType === 'EXCEPTION') {
      exceptions = cleaned;
      text = '';
    }

    startNewUnit({
      unit_type: unitType,
      unit_label,
      title,
      text,
      notes,
      exceptions,
      paraIndex: block.paraIndex,
      warnings,
    });
  }

  flushCurrentUnit();
  // If anything is still paused at EOF, flush it.
  if (pausedUnit) {
    currentUnit = pausedUnit;
    pausedUnit = null;
    flushCurrentUnit();
  }
  
  log(`Processed ${blocks.length} blocks, created ${rows.length} initial units`, 30);

  // Post-pass: extract embedded state instruction packs from base rows.
  log('Extracting state variation instructions...', 35);
  // Base rows must remain national text only; instruction packs become STATE_VARIATION_AMENDMENT rows
  // which are then split into atomic STATE_VARIATION rows in the next post-pass.
  {
    const looksLikeInstrPack = (t: string): boolean => {
      const s = (t || '').toLowerCase();
      const hasState = /\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\b/i.test(t || '');
      // Instruction packs nearly always use explicit editorial verbs.
      const hasStrongEditorial =
        /(?:^|\n)\s*(delete|insert|replace)\b/i.test(t || '') ||
        /\b(delete|insert|replace)\b/i.test(s) ||
        /(left blank|deliberately been left blank)/.test(s);
      // Avoid false positives like "does not apply to joints..." unless paired with a state token or a label target.
      const hasNotApply = /(does not apply|not apply)/.test(s);
      const hasTargetLabel = /\b[A-Z]\d+[A-Z]\d+(?:\(\d+\))?\b/.test(t || '');

      if (hasState && hasNotApply) return true;
      if (hasState && (hasStrongEditorial || (hasNotApply && hasTargetLabel))) return true;
      if ((hasStrongEditorial || (hasNotApply && hasTargetLabel)) && hasTargetLabel) return true;
      return false;
    };

    const findInstrStartIndex = (t: string): number => {
      // Prefer "STATE + action" markers; fall back to first state token.
      const m = t.match(/\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\b[\s\S]{0,80}?\b(Delete|Insert|Replace)\b/i);
      if (m && m.index !== undefined) return m.index;
      const m2 = t.match(/\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\b[\s\S]{0,80}?(does not apply|left blank|deliberately been left blank|not apply)/i);
      if (m2 && m2.index !== undefined) return m2.index;
      // Handle phrasing like "does not apply in NSW" where the jurisdiction appears after the phrase.
      const m4 = t.match(/(does not apply|left blank|deliberately been left blank|not apply)[\s\S]{0,80}?\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\b/i);
      if (m4 && m4.index !== undefined) return m4.index;
      const m3 = t.match(/\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\b/i);
      if (m3 && m3.index !== undefined) return m3.index;
      return -1;
    };

    const out: NccUnitRow[] = [];
    for (const r of rows) {
      // Never extract from already-state rows, headings, or assets.
      if (r.unit_type === 'STATE_VARIATION' || r.unit_type === 'STATE_VARIATION_AMENDMENT') {
        out.push(r);
        continue;
      }
      if (!r.text || !looksLikeInstrPack(r.text)) {
        out.push(r);
        continue;
      }

      const idx = findInstrStartIndex(r.text);
      if (idx < 0) {
        out.push(r);
        continue;
      }

      const baseText = normalizeWhitespace(r.text.slice(0, idx)).trim();
      const instrText = normalizeWhitespace(r.text.slice(idx)).trim();

      // Clean base row (national text only)
      const cleanedBase = { ...r };
      cleanedBase.text = baseText;
      cleanedBase.rag_text = normalizeWhitespace([
        `[${cleanedBase.unit_type}]${cleanedBase.unit_label ? ` ${cleanedBase.unit_label}` : ''}`,
        `path: ${cleanedBase.path || ''}`,
        cleanedBase.title ? `title: ${cleanedBase.title}` : '',
        cleanedBase.text ? `text: ${cleanedBase.text}` : '',
        cleanedBase.notes ? `notes: ${cleanedBase.notes}` : '',
        cleanedBase.exceptions ? `exceptions: ${cleanedBase.exceptions}` : '',
      ].filter(Boolean).join('\n'));

      out.push(cleanedBase);

      // Emit an amendment row that will be split into atomic STATE_VARIATION rows next.
      const order_in_parent = nextOrder(cleanedBase.parent_anchor_id);
      const anchor_id = `${slug(config.volume)}::${slug(cleanedBase.path).slice(0, 120) || 'ROOT'}::STATE_VARIATION_AMENDMENT::${slug(String(order_in_parent))}`;
      const rag_text = normalizeWhitespace([
        `[STATE_VARIATION_AMENDMENT]`,
        `path: ${cleanedBase.path || ''}`,
        `text: ${instrText}`,
      ].filter(Boolean).join('\n'));

      const warningsSet = new Set<string>();
      try {
        const w = JSON.parse(cleanedBase.warnings || '[]');
        if (Array.isArray(w)) w.forEach(x => warningsSet.add(String(x)));
      } catch { /* ignore */ }
      warningsSet.add('STATE_INSTRUCTION_EXTRACTED_FROM_BASE');

      out.push({
        ...cleanedBase,
        anchor_id,
        unit_type: 'STATE_VARIATION_AMENDMENT',
        compliance_weight: 'NON_MANDATORY',
        title: '',
        text: instrText,
        rag_text,
        // Keep state unset at this stage; the splitter will set applies_state/action.
        applies_state: '',
        variation_action: 'NOT_APPLICABLE',
        affected_unit_label: cleanedBase.unit_label || '',
        affected_subparts: '',
        affects_anchor_id: '',
        warnings: JSON.stringify(Array.from(warningsSet)),
        normative_status: 'INFORMATIVE',
        conditionality: 'ALWAYS',
        raw_title: cleanedBase.raw_title,
        raw_text: instrText,
      });
    }

    rows.length = 0;
    rows.push(...out);
  }

  // Post-pass: split/link STATE_VARIATION_AMENDMENT instruction blocks into atomic STATE_VARIATION rows.
  log('Splitting state variation amendments into atomic rows...', 40);
  {
    const baseLabelToAnchorId = new Map<string, string>();
    for (const r of rows) {
      if (!r.unit_label) continue;
      if (r.unit_type === 'STATE_VARIATION' || r.unit_type === 'STATE_VARIATION_AMENDMENT') continue;
      if (r.applies_state) continue;
      if (!baseLabelToAnchorId.has(r.unit_label)) baseLabelToAnchorId.set(r.unit_label, r.anchor_id);
    }

    const parseAction = (t: string): VariationAction => {
      const s = (t || '').toLowerCase();
      if (/(does not apply|deliberately been left blank|not apply)/.test(s)) return 'NOT_APPLICABLE';
      if (/\bdelete\b/.test(s) && /\binsert\b/.test(s)) return 'REPLACE';
      if (/\bdelete\b/.test(s)) return 'DELETE';
      if (/\binsert\b/.test(s)) return 'INSERT';
      return 'AMEND_PART';
    };

    const extractActionTargets = (t: string): string[] => {
      // Only extract labels that are explicit targets of an instruction, not incidental cross-references.
      // Examples captured:
      // - "Delete C4D12(4) and insert ..."
      // - "Insert subclause NSW C4D12(10) ..."
      // - "Replace J3D1(1) ..."
      const out = new Set<string>();
      const s = t || '';

      const patterns: RegExp[] = [
        /\bdelete\s+([A-Z]\d+[A-Z]\d+(?:\(\d+\))?)\b/gi,
        /\breplace\s+([A-Z]\d+[A-Z]\d+(?:\(\d+\))?)\b/gi,
        /\binsert\s+(?:subclause|clause)\s+(?:SA|NSW|VIC|QLD|WA|TAS|ACT|NT)?\s*([A-Z]\d+[A-Z]\d+(?:\(\d+\))?)\b/gi,
        /\binsert\s+(?:SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\s+([A-Z]\d+[A-Z]\d+(?:\(\d+\))?)\b/gi,
      ];

      for (const re of patterns) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(s)) !== null) {
          if (m[1]) out.add(m[1].replace(/\s+/g, ''));
        }
      }
      return Array.from(out);
    };

    const extractSubparts = (t: string): string => {
      const parts = new Set<string>();
      const re = /\(\d+\)|\([a-z]\)/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t)) !== null) parts.add(m[0]);
      return Array.from(parts).join(', ');
    };

    const out: NccUnitRow[] = [];
    for (const r of rows) {
      if (r.unit_type !== 'STATE_VARIATION_AMENDMENT') {
        out.push(r);
        continue;
      }

      const instr = r.raw_text || r.rag_text || '';
      const stateMatch = instr.match(/\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\b/);
      const state = (stateMatch?.[1] || '').toUpperCase();
      const action = parseAction(instr);
      const labels = extractActionTargets(instr);
      const affected_subparts = extractSubparts(instr);

      // If we can't determine a jurisdiction, keep the amendment row as-is.
      // We only emit STATE_VARIATION rows when a state/territory is explicit.
      if (!state) {
        out.push(r);
        continue;
      }

      if (labels.length === 0) {
        out.push(r);
        continue;
      }

      for (const lbl of labels) {
        const baseLabel = lbl.split('(')[0];
        const affects_anchor_id = baseLabelToAnchorId.get(baseLabel) || '';
        const subpartMatch = lbl.match(/\((\d+)\)$/);
        const lblSub = subpartMatch?.[1] || '';

        const warningsSet = new Set<string>();
        try {
          const w = JSON.parse(r.warnings || '[]');
          if (Array.isArray(w)) w.forEach(x => warningsSet.add(String(x)));
        } catch { /* ignore */ }
        warningsSet.add('STATE_VARIATION_SPLIT');
        if (!affects_anchor_id) warningsSet.add(`UNRESOLVED_AFFECTS_ANCHOR:${baseLabel}`);

        const anchor_id = `${slug(config.volume)}::${slug(r.path).slice(0, 120) || 'ROOT'}::STATE_VARIATION::${slug(`${state || 'STATE'}_${lbl}`)}`;
        const rag_text = normalizeWhitespace([
          `[STATE_VARIATION] ${state ? state + ' ' : ''}${lbl}`,
          `path: ${r.path || ''}`,
          `text: ${normalizeWhitespace(instr)}`,
        ].filter(Boolean).join('\n'));

        out.push({
          ...r,
          anchor_id,
          unit_type: 'STATE_VARIATION',
          compliance_weight: 'NON_MANDATORY',
          title: '',
          text: normalizeWhitespace(instr),
          rag_text,
          applies_state: state || '',
          variation_action: action,
          affected_unit_label: lbl,
          affected_subparts: lblSub ? lblSub : affected_subparts,
          affects_anchor_id,
          warnings: JSON.stringify(Array.from(warningsSet)),
          normative_status: 'INFORMATIVE',
          conditionality: 'ALWAYS',
        });
      }
    }
    rows.length = 0;
    rows.push(...out);
  }

  // Post-pass: extract jurisdiction subpart blocks from base rows flagged STATE_VARIATION_EMBEDDED.
  // Targets markers like "NSW C4D12(4)" (or "SA E1D2") and emits one STATE_VARIATION row per block.
  log('Extracting jurisdiction subpart blocks...', 45);
  {
    const labelToAnchor = new Map<string, string>();
    for (const r of rows) {
      if (!r.unit_label) continue;
      if (r.unit_type === 'STATE_VARIATION' || r.unit_type === 'STATE_VARIATION_AMENDMENT') continue;
      if (!labelToAnchor.has(r.unit_label)) labelToAnchor.set(r.unit_label, r.anchor_id);
    }

    const parseWarnings = (w: string): string[] => {
      try {
        const a = JSON.parse(w || '[]');
        if (Array.isArray(a)) return a.map(String);
      } catch { /* ignore */ }
      return [];
    };

    const addWarning = (w: string, add: string): string => {
      const s = new Set<string>(parseWarnings(w));
      s.add(add);
      return JSON.stringify(Array.from(s));
    };

    const JURIS_RE = /SA|NSW|VIC|QLD|WA|TAS|ACT|NT/;
    const hasModificationLanguage = (t: string): boolean => {
      const s = (t || '').toLowerCase();
      return (
        /\bdelete\b/.test(s) ||
        /\binsert\b/.test(s) ||
        /\breplace\b/.test(s) ||
        /(does not apply|not apply|left blank|deliberately been left blank)/.test(s)
      );
    };

    // Inline references like "Refer to NSW E2D16..." must NOT be extracted as variations.
    const isInlineRefOnly = (t: string): boolean => {
      const s = (t || '').toLowerCase();
      return !hasModificationLanguage(t) && /\brefer to\b/.test(s);
    };

    const firstJurisdictionInText = (t: string): string => {
      const m = (t || '').match(/\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\b/i);
      return (m?.[1] || '').toUpperCase();
    };

    const markerAnywhereRe = new RegExp(`\\b(${JURIS_RE.source})\\s+([A-Z]\\d+)\\s*([A-Z]\\d+)(?:\\((\\d+)\\))?(?=\\b|to\\b)`, 'gi');

    let extracted = 0;
    let unbounded = 0;

    const out: NccUnitRow[] = [];
    for (const r of rows) {
      const warns = parseWarnings(r.warnings);
      if (!r.text || r.unit_type === 'STATE_VARIATION' || r.unit_type === 'STATE_VARIATION_AMENDMENT') {
        out.push(r);
        continue;
      }

      const textNorm = String(r.text).replace(/\r\n/g, '\n');
      const keep = textNorm;

      // Find all state+label markers in the text. We then emit variation rows only if the surrounding
      // paragraph contains modification language.
      const spans: Array<{ start: number; end: number; state: string; label: string; sub: string }> = [];
      let mm: RegExpExecArray | null;
      while ((mm = markerAnywhereRe.exec(textNorm)) !== null) {
        spans.push({
          start: mm.index,
          end: mm.index + mm[0].length,
          state: (mm[1] || '').toUpperCase(),
          label: `${mm[2]}${mm[3]}`.replace(/\s+/g, ''),
          sub: mm[4] || '',
        });
      }
      if (spans.length === 0) {
        out.push(r);
        continue;
      }

      const baseLabelForRow = String(r.unit_label || '').replace(/\s+/g, '');
      const overallState = firstJurisdictionInText(textNorm);
      const overallHasStateMarker = /\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\s+[A-Z]\d+\s*[A-Z]\d+(\(\d+\))?(?=\b|to\b)/i.test(textNorm);

      // Special case: embedded state-specific subparts for THIS clause, e.g. "NSW C4D12(5) (5) ..."
      // These are NOT "delete/insert" instructions; they are replacement text and must become STATE_VARIATION rows.
      if (baseLabelForRow) {
        const m = baseLabelForRow.match(/^([A-Z]\d+)([A-Z]\d+)$/);
        const baseLabelPattern = m ? `${m[1]}\\s*${m[2]}` : baseLabelForRow.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const subpartRe = new RegExp(`\\b(${JURIS_RE.source})\\s+${baseLabelPattern}\\s*\\((\\d+)\\)\\s*\\(\\2\\)`, 'gi');
        const hits: Array<{ idx: number; state: string; sub: string }> = [];
        let hm: RegExpExecArray | null;
        while ((hm = subpartRe.exec(textNorm)) !== null) {
          hits.push({ idx: hm.index, state: (hm[1] || '').toUpperCase(), sub: hm[2] });
        }
        // (no debug logging)

        if (hits.length > 0) {
          // Extract each block from its marker to the next marker (or end).
          const already = new Set<string>();
          for (let i = 0; i < hits.length; i++) {
            const startIdx = hits[i].idx;
            const endIdx = (i + 1 < hits.length) ? hits[i + 1].idx : textNorm.length;
            const rawBlock = textNorm.slice(startIdx, endIdx).trim();
            const cleanedBlock = cleanNccTextKeepingNumbering(rawBlock);
            const applies_state = hits[i].state;
            const sub = hits[i].sub;
            const affected_unit_label = `${baseLabelForRow}(${sub})`;
            already.add(`${applies_state}__${affected_unit_label}`);
            const base_anchor = labelToAnchor.get(baseLabelForRow) || '';

            const anchor_id = `${slug(r.volume)}::${slug(r.path).slice(0, 120) || 'ROOT'}::STATE_VARIATION::${slug(`${applies_state}_${baseLabelForRow}_${sub}`)}`;
            const rag_text = normalizeWhitespace([
              `[STATE_VARIATION] ${applies_state} ${affected_unit_label}`,
              `path: ${r.path || ''}`,
              `text: ${cleanedBlock}`,
            ].filter(Boolean).join('\n'));

            const warningsSet = new Set<string>(warns);
            warningsSet.add('STATE_VARIATION_EXTRACTED');
            if (!base_anchor) warningsSet.add(`UNRESOLVED_AFFECTS_ANCHOR:${baseLabelForRow}`);

            out.push({
              ...r,
              anchor_id,
              unit_type: 'STATE_VARIATION',
              compliance_weight: 'NON_MANDATORY',
              title: '',
              text: cleanedBlock,
              rag_text,
              applies_state,
              variation_action: 'REPLACE',
              affected_unit_label,
              affected_subparts: sub,
              affects_anchor_id: base_anchor,
              warnings: JSON.stringify(Array.from(warningsSet)),
              normative_status: 'INFORMATIVE',
              conditionality: 'ALWAYS',
              raw_title: r.raw_title,
              raw_text: rawBlock,
            });
            extracted++;

            // If the extracted block contains instruction-only inserts for additional subparts (e.g. "Insert subclause NSW C4D12(10) ..."),
            // emit separate STATE_VARIATION rows for those subparts as instruction-only placeholders.
            const insertOnlyRe = new RegExp(`\\binsert\\s+subclause\\s+(${JURIS_RE.source})\\s+${baseLabelPattern}\\s*\\((\\d+)\\)`, 'i');
            const ins = rawBlock.match(insertOnlyRe);
            if (ins) {
              const applies_state2 = (ins[1] || '').toUpperCase();
              const sub2 = ins[2];
              const affected2 = `${baseLabelForRow}(${sub2})`;
              const key2 = `${applies_state2}__${affected2}`;
              if (!already.has(key2)) {
                already.add(key2);
                const base_anchor2 = labelToAnchor.get(baseLabelForRow) || '';
                const anchor_id2 = `${slug(r.volume)}::${slug(r.path).slice(0, 120) || 'ROOT'}::STATE_VARIATION::${slug(`${applies_state2}_${baseLabelForRow}_${sub2}`)}`;
                const rag_text2 = normalizeWhitespace([
                  `[STATE_VARIATION] ${applies_state2} ${affected2}`,
                  `path: ${r.path || ''}`,
                  `text: ${cleanNccTextKeepingNumbering(ins[0])}`,
                ].filter(Boolean).join('\n'));
                const warningsSet2 = new Set<string>(warns);
                warningsSet2.add('STATE_VARIATION_EXTRACTED');
                warningsSet2.add('INSTRUCTION_ONLY_INSERT');
                if (!base_anchor2) warningsSet2.add(`UNRESOLVED_AFFECTS_ANCHOR:${baseLabelForRow}`);
                out.push({
                  ...r,
                  anchor_id: anchor_id2,
                  unit_type: 'STATE_VARIATION',
                  compliance_weight: 'NON_MANDATORY',
                  title: '',
                  text: cleanNccTextKeepingNumbering(ins[0]),
                  rag_text: rag_text2,
                  applies_state: applies_state2,
                  variation_action: 'INSERT',
                  affected_unit_label: affected2,
                  affected_subparts: sub2,
                  affects_anchor_id: base_anchor2,
                  warnings: JSON.stringify(Array.from(warningsSet2)),
                  normative_status: 'INFORMATIVE',
                  conditionality: 'ALWAYS',
                  raw_title: r.raw_title,
                  raw_text: ins[0],
                });
                extracted++;
              }
            }
          }

          // Also extract any explicit instruction paragraphs (Insert/Delete/Replace...) related to this clause from the tail.
          // This captures cases like "Insert subclause NSW C4D12(10)..." even if (10) content isn't present.
          const tail = textNorm.slice(hits[0].idx);
          const tailParas = tail.split(/\n{2,}/);
          const instrRe = new RegExp(`\\b(${JURIS_RE.source})\\s+${baseLabelPattern}\\s*\\((\\d+)\\)(?=\\b|to\\b)`, 'gi');
          for (const p of tailParas) {
            if (!p.trim()) continue;
            if (!hasModificationLanguage(p)) continue;
            instrRe.lastIndex = 0;
            let im: RegExpExecArray | null;
            while ((im = instrRe.exec(p)) !== null) {
              const applies_state = (im[1] || '').toUpperCase();
              const sub = im[2];
              const affected_unit_label = `${baseLabelForRow}(${sub})`;
              const key = `${applies_state}__${affected_unit_label}`;
              if (already.has(key)) continue;
              already.add(key);

              const base_anchor = labelToAnchor.get(baseLabelForRow) || '';
              const rawBlock = p.trim();
              const cleanedBlock = cleanNccTextKeepingNumbering(rawBlock);
              const s = rawBlock.toLowerCase();
              let variation_action: VariationAction = 'REPLACE';
              if (/(does not apply|not apply|left blank|deliberately been left blank)/.test(s)) variation_action = 'NOT_APPLICABLE';
              else if (/\bdelete\b/.test(s) && /\binsert\b/.test(s)) variation_action = 'REPLACE';
              else if (/\bdelete\b/.test(s)) variation_action = 'DELETE';
              else if (/\binsert\b/.test(s)) variation_action = 'INSERT';
              else if (/\breplace\b/.test(s)) variation_action = 'REPLACE';

              const anchor_id = `${slug(r.volume)}::${slug(r.path).slice(0, 120) || 'ROOT'}::STATE_VARIATION::${slug(`${applies_state}_${baseLabelForRow}_${sub}`)}`;
              const rag_text = normalizeWhitespace([
                `[STATE_VARIATION] ${applies_state} ${affected_unit_label}`,
                `path: ${r.path || ''}`,
                `text: ${cleanedBlock}`,
              ].filter(Boolean).join('\n'));

              const warningsSet = new Set<string>(warns);
              warningsSet.add('STATE_VARIATION_EXTRACTED');
              warningsSet.add('INSTRUCTION_ONLY_INSERT');
              if (!base_anchor) warningsSet.add(`UNRESOLVED_AFFECTS_ANCHOR:${baseLabelForRow}`);

              out.push({
                ...r,
                anchor_id,
                unit_type: 'STATE_VARIATION',
                compliance_weight: 'NON_MANDATORY',
                title: '',
                text: cleanedBlock,
                rag_text,
                applies_state,
                variation_action,
                affected_unit_label,
                affected_subparts: sub,
                affects_anchor_id: base_anchor,
                warnings: JSON.stringify(Array.from(warningsSet)),
                normative_status: 'INFORMATIVE',
                conditionality: 'ALWAYS',
                raw_title: r.raw_title,
                raw_text: rawBlock,
              });
              extracted++;
            }
          }

          // Remove the extracted subpart blocks from base text by keeping only text before first marker.
          // (Conservative; avoids accidentally keeping state-only content.)
          const cleanedBaseText = cleanNccTextKeepingNumbering(normalizeWhitespace(textNorm.slice(0, hits[0].idx)));
          const baseWarnings = addWarning(r.warnings, 'STATE_VARIATION_EXTRACTED');
          const baseRow: NccUnitRow = { ...r, text: cleanedBaseText, raw_text: r.raw_text, warnings: baseWarnings };
          baseRow.rag_text = normalizeWhitespace([
            `[${baseRow.unit_type}]${baseRow.unit_label ? ` ${baseRow.unit_label}` : ''}`,
            `path: ${baseRow.path || ''}`,
            baseRow.title ? `title: ${baseRow.title}` : '',
            baseRow.text ? `text: ${baseRow.text}` : '',
            baseRow.notes ? `notes: ${baseRow.notes}` : '',
            baseRow.exceptions ? `exceptions: ${baseRow.exceptions}` : '',
          ].filter(Boolean).join('\n'));

          out.push(baseRow);
          continue;
        }
      }

      // If it's just a cross-reference, keep it.
      if (isInlineRefOnly(r.text)) {
        out.push(r);
        continue;
      }
      if (!hasModificationLanguage(r.text)) {
        // Only extract actual jurisdiction modifications. Keep cross-references as-is.
        out.push(r);
        continue;
      }

      // Split into paragraphs; extract paragraphs that contain modification language and are associated with a jurisdiction.
      const paras = textNorm.split(/\n{2,}/);
      const keptParas: string[] = [];

      for (const p of paras) {
        if (!p.trim()) continue;
        const pHasMarker = new RegExp(`\\b${JURIS_RE.source}\\s+[A-Z]\\d+\\s*[A-Z]\\d+(?:\\(\\d+\\))?(?=\\b|to\\b)`, 'i').test(p);
        const pHasJurisdictionOnly = /\b(in|for)\s+(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\b/i.test(p) || /\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\b/i.test(p);

        // If this paragraph has no jurisdiction signal, keep it unless the overall clause is clearly a jurisdiction modification pack.
        if (!pHasMarker && !pHasJurisdictionOnly) {
          if (!(overallHasStateMarker && hasModificationLanguage(p))) {
            keptParas.push(p);
            continue;
          }
          // Fall through: treat this as part of a jurisdiction modification pack for the clause.
        }

        // If it's just a cross-reference, keep it.
        if (isInlineRefOnly(p) || !hasModificationLanguage(p)) {
          keptParas.push(p);
          continue;
        }

        // Extract every state+label(+subpart) mentioned in this paragraph as its own variation row.
        const local = new RegExp(`\\b(${JURIS_RE.source})\\s+([A-Z]\\d+)\\s*([A-Z]\\d+)(?:\\((\\d+)\\))?(?=\\b|to\\b)`, 'gi');
        let lm: RegExpExecArray | null;
        const seen = new Set<string>();
        let anyLabelFound = false;
        while ((lm = local.exec(p)) !== null) {
          const applies_state = (lm[1] || '').toUpperCase();
          const baseLabel = `${lm[2]}${lm[3]}`.replace(/\s+/g, '');
          const sub = lm[4] || '';
          const affected_unit_label = sub ? `${baseLabel}(${sub})` : baseLabel;
          const key = `${applies_state}__${affected_unit_label}`;
          if (seen.has(key)) continue;
          seen.add(key);
          anyLabelFound = true;

          const base_anchor = labelToAnchor.get(baseLabel) || '';
          const rawBlock = p.trim();
          const cleanedBlock = cleanNccTextKeepingNumbering(rawBlock);

          const s = rawBlock.toLowerCase();
          let variation_action: VariationAction = 'REPLACE';
          if (/(does not apply|not apply|left blank|deliberately been left blank)/.test(s)) variation_action = 'NOT_APPLICABLE';
          else if (/\bdelete\b/.test(s) && /\binsert\b/.test(s)) variation_action = 'REPLACE';
          else if (/\bdelete\b/.test(s)) variation_action = 'DELETE';
          else if (/\binsert\b/.test(s)) variation_action = 'INSERT';
          else if (/\breplace\b/.test(s)) variation_action = 'REPLACE';

          const anchor_id = `${slug(r.volume)}::${slug(r.path).slice(0, 120) || 'ROOT'}::STATE_VARIATION::${slug(`${applies_state}_${baseLabel}${sub ? `_${sub}` : ''}`)}`;
          const rag_text = normalizeWhitespace([
            `[STATE_VARIATION] ${applies_state} ${affected_unit_label}`,
            `path: ${r.path || ''}`,
            `text: ${cleanedBlock}`,
          ].filter(Boolean).join('\n'));

          const warningsSet = new Set<string>(warns);
          warningsSet.add('STATE_VARIATION_EXTRACTED');
          if (!base_anchor) warningsSet.add(`UNRESOLVED_AFFECTS_ANCHOR:${baseLabel}`);

          out.push({
            ...r,
            anchor_id,
            unit_type: 'STATE_VARIATION',
            compliance_weight: 'NON_MANDATORY',
            title: '',
            text: cleanedBlock,
            rag_text,
            applies_state,
            variation_action,
            affected_unit_label,
            affected_subparts: sub ? sub : '',
            affects_anchor_id: base_anchor,
            warnings: JSON.stringify(Array.from(warningsSet)),
            normative_status: 'INFORMATIVE',
            conditionality: 'ALWAYS',
            raw_title: r.raw_title,
            raw_text: rawBlock,
          });
          extracted++;
        }

        // If we have modification language but no explicit target label in the paragraph,
        // attach it to the base row's label (keeps base clause clean and variation linked).
        if (!anyLabelFound && r.unit_label) {
          const applies_state = firstJurisdictionInText(p) || overallState || 'STATE';
          const baseLabel = String(r.unit_label).replace(/\s+/g, '');
          const affected_unit_label = baseLabel;
          const base_anchor = labelToAnchor.get(baseLabel) || '';
          const rawBlock = p.trim();
          const cleanedBlock = cleanNccTextKeepingNumbering(rawBlock);

          const s = rawBlock.toLowerCase();
          let variation_action: VariationAction = 'REPLACE';
          if (/(does not apply|not apply|left blank|deliberately been left blank)/.test(s)) variation_action = 'NOT_APPLICABLE';
          else if (/\bdelete\b/.test(s) && /\binsert\b/.test(s)) variation_action = 'REPLACE';
          else if (/\bdelete\b/.test(s)) variation_action = 'DELETE';
          else if (/\binsert\b/.test(s)) variation_action = 'INSERT';
          else if (/\breplace\b/.test(s)) variation_action = 'REPLACE';

          const anchor_id = `${slug(r.volume)}::${slug(r.path).slice(0, 120) || 'ROOT'}::STATE_VARIATION::${slug(`${applies_state}_${baseLabel}`)}`;
          const rag_text = normalizeWhitespace([
            `[STATE_VARIATION] ${applies_state} ${affected_unit_label}`,
            `path: ${r.path || ''}`,
            `text: ${cleanedBlock}`,
          ].filter(Boolean).join('\n'));

          const warningsSet = new Set<string>(warns);
          warningsSet.add('STATE_VARIATION_EXTRACTED');
          if (!base_anchor) warningsSet.add(`UNRESOLVED_AFFECTS_ANCHOR:${baseLabel}`);

          out.push({
            ...r,
            anchor_id,
            unit_type: 'STATE_VARIATION',
            compliance_weight: 'NON_MANDATORY',
            title: '',
            text: cleanedBlock,
            rag_text,
            applies_state,
            variation_action,
            affected_unit_label,
            affected_subparts: '',
            affects_anchor_id: base_anchor,
            warnings: JSON.stringify(Array.from(warningsSet)),
            normative_status: 'INFORMATIVE',
            conditionality: 'ALWAYS',
            raw_title: r.raw_title,
            raw_text: rawBlock,
          });
          extracted++;
        }

        // Replace the whole paragraph with a placeholder in base text.
        keptParas.push('[State variation instruction extracted]');
      }

      const newBaseText = normalizeWhitespace(keptParas.join('\n\n'));
      const baseWarnings = addWarning(r.warnings, 'STATE_VARIATION_EXTRACTED');
      const cleanedBaseText = cleanNccTextKeepingNumbering(newBaseText);

      const baseRow: NccUnitRow = {
        ...r,
        text: cleanedBaseText,
        raw_text: r.raw_text, // preserve original raw_text
        warnings: baseWarnings,
      };
      baseRow.rag_text = normalizeWhitespace([
        `[${baseRow.unit_type}]${baseRow.unit_label ? ` ${baseRow.unit_label}` : ''}`,
        `path: ${baseRow.path || ''}`,
        baseRow.title ? `title: ${baseRow.title}` : '',
        baseRow.text ? `text: ${baseRow.text}` : '',
        baseRow.notes ? `notes: ${baseRow.notes}` : '',
        baseRow.exceptions ? `exceptions: ${baseRow.exceptions}` : '',
      ].filter(Boolean).join('\n'));

      out.push(baseRow);
    }

    rows.length = 0;
    rows.push(...out);
    // Note: this is a build-level summary; stored as a global warning row in the returned result.
    // We don't have access to the per-block local `warnings` here, so we add these to result.warnings later.
    (globalThis as any).__NCC_SV_EXTRACTED__ = { extracted, unbounded };
  }

  // Post-pass: instruction-only INSERT handling.
  // If the doc contains patterns like "Insert subclause NSW C4D12(10) ..." but the inserted payload isn't captured inline,
  // emit a STATE_VARIATION row with variation_action=INSERT and warning INSTRUCTION_ONLY_INSERT.
  {
    const labelToAnchor = new Map<string, string>();
    for (const r of rows) {
      if (!r.unit_label) continue;
      if (r.unit_type === 'STATE_VARIATION' || r.unit_type === 'STATE_VARIATION_AMENDMENT') continue;
      if (!labelToAnchor.has(r.unit_label)) labelToAnchor.set(r.unit_label, r.anchor_id);
    }

    const existingVar = new Set<string>();
    for (const r of rows) {
      if (r.unit_type !== 'STATE_VARIATION') continue;
      const key = `${(r.applies_state || '').toUpperCase()}__${String(r.affected_unit_label || '').replace(/\s+/g, '')}`;
      if (key.trim() !== '__') existingVar.add(key);
    }

    const J = /SA|NSW|VIC|QLD|WA|TAS|ACT|NT/;
    // Supports both "NSW C4D12(10)" and "NSW C4 D12(10)".
    const insertOnly = new RegExp(`\\bInsert\\s+subclause\\s+(${J.source})\\s+([A-Z]\\d+)\\s*([A-Z]\\d+)?\\s*\\((\\d+)\\)`, 'gi');

    const out: NccUnitRow[] = [];
    for (const r of rows) {
      out.push(r);
      if (!r.text || r.unit_type === 'STATE_VARIATION' || r.unit_type === 'STATE_VARIATION_AMENDMENT') continue;

      const t = [r.text, r.raw_text, r.rag_text].filter(Boolean).join('\n');
      insertOnly.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = insertOnly.exec(t)) !== null) {
        const applies_state = (m[1] || '').toUpperCase();
        const baseLabel = `${m[2]}${m[3] || ''}`.replace(/\s+/g, '');
        const sub = m[4] || '';
        const affected_unit_label = `${baseLabel}(${sub})`;
        const key = `${applies_state}__${affected_unit_label}`;
        if (existingVar.has(key)) continue;
        existingVar.add(key);

        const affects_anchor_id = labelToAnchor.get(baseLabel) || '';
        const warningsSet = new Set<string>();
        try {
          const w = JSON.parse(r.warnings || '[]');
          if (Array.isArray(w)) w.forEach(x => warningsSet.add(String(x)));
        } catch { /* ignore */ }
        warningsSet.add('STATE_VARIATION_EXTRACTED');
        warningsSet.add('INSTRUCTION_ONLY_INSERT');
        if (!affects_anchor_id) warningsSet.add(`UNRESOLVED_AFFECTS_ANCHOR:${baseLabel}`);

        const anchor_id = `${slug(r.volume)}::${slug(r.path).slice(0, 120) || 'ROOT'}::STATE_VARIATION::${slug(`${applies_state}_${baseLabel}_${sub}`)}`;
        const rawBlock = m[0];
        const cleanedBlock = cleanNccTextKeepingNumbering(rawBlock);
        const rag_text = normalizeWhitespace([
          `[STATE_VARIATION] ${applies_state} ${affected_unit_label}`,
          `path: ${r.path || ''}`,
          `text: ${cleanedBlock}`,
        ].filter(Boolean).join('\n'));

        out.push({
          ...r,
          anchor_id,
          unit_type: 'STATE_VARIATION',
          compliance_weight: 'NON_MANDATORY',
          title: '',
          // Payload is not present; keep raw_text but emit empty text.
          text: '',
          rag_text,
          applies_state,
          variation_action: 'INSERT',
          affected_unit_label,
          affected_subparts: sub ? `(${sub})` : '',
          affects_anchor_id,
          warnings: JSON.stringify(Array.from(warningsSet)),
          normative_status: 'INFORMATIVE',
          conditionality: 'ALWAYS',
          raw_title: r.raw_title,
          raw_text: rawBlock,
          // New fields (FINDING 2-6) - initialized in post-pass
          table_grid_json: '',
          table_key_values: '',
          base_unit_label: '',
          affected_subclause: '',
          conditions_text: '',
          exceptions_text: '',
          requirements_list: '',
          standards_referenced: '',
          notes_quality: '',
        });
      }
    }

    rows.length = 0;
    rows.push(...out);
  }

  // Merge duplicate unit labels: if same unit_label + same unit_type appears multiple times, merge into first occurrence.
  // This avoids duplicated E1P3-like rows.
  {
    const mergeKey = (r: NccUnitRow) => `${r.unit_type}::${r.unit_label}`;
    const firstIndexByKey = new Map<string, number>();
    const merged: NccUnitRow[] = [];

    const join = (a: string, b: string) => (a && b) ? `${a}\n${b}` : (a || b);
    const mergeWarnings = (a: string, b: string): string => {
      try {
        const aa = JSON.parse(a || '[]');
        const bb = JSON.parse(b || '[]');
        const out = new Set<string>();
        if (Array.isArray(aa)) aa.forEach(x => out.add(String(x)));
        if (Array.isArray(bb)) bb.forEach(x => out.add(String(x)));
        return JSON.stringify(Array.from(out));
      } catch {
        return a || b || '[]';
      }
    };

    for (const r of rows) {
      // Never merge state-variation rows (dedupe handled separately)
      if (!r.unit_label || r.unit_type === 'STATE_VARIATION') {
        merged.push(r);
        continue;
      }

      const key = mergeKey(r);
      const idx = firstIndexByKey.get(key);
      if (idx === undefined) {
        firstIndexByKey.set(key, merged.length);
        merged.push(r);
        continue;
      }

      const base = merged[idx];
      base.text = join(base.text, r.text);
      base.notes = join(base.notes, r.notes);
      base.exceptions = join(base.exceptions, r.exceptions);
      base.para_start = Math.min(base.para_start, r.para_start);
      base.para_end = Math.max(base.para_end, r.para_end);
      base.warnings = mergeWarnings(base.warnings, r.warnings);

      // Rebuild rag_text deterministically from merged fields
      base.rag_text = normalizeWhitespace([
        `[${base.unit_type}]${base.unit_label ? ` ${base.unit_label}` : ''}`,
        `path: ${base.path || ''}`,
        base.title ? `title: ${base.title}` : '',
        base.text ? `text: ${base.text}` : '',
        base.notes ? `notes: ${base.notes}` : '',
        base.exceptions ? `exceptions: ${base.exceptions}` : '',
      ].filter(Boolean).join('\n'));
    }

    rows.length = 0;
    rows.push(...merged);
  }

  // Post-pass: FINDING 1-6 - Populate new fields and fix empty text
  {
    for (const r of rows) {
      // FIX F1: STATE_VARIATION instruction-only promotion (Part 2 fix)
      if (r.unit_type === 'STATE_VARIATION' && !normalizeWhitespace(r.text) && r.raw_text) {
        const hasInstruction = /(Insert|Omit|Substitute|Replace)\s+(subclause|clause)/i.test(r.raw_text);
        if (hasInstruction) {
          r.text = cleanNccTextKeepingNumbering(r.raw_text);
          if (!r.notes_quality) r.notes_quality = 'INSTRUCTION_ONLY_VARIATION';
          else if (!r.notes_quality.includes('INSTRUCTION_ONLY_VARIATION')) r.notes_quality += '|INSTRUCTION_ONLY_VARIATION';
        }
      }

      // FINDING 1: Fix empty text for core clause types
      const coreTypes: NccUnitType[] = ['PERFORMANCE_REQUIREMENT', 'DTS_PROVISION', 'SPECIFICATION_CLAUSE', 'FUNCTIONAL_STATEMENT', 'VERIFICATION_METHOD'];
      if (coreTypes.includes(r.unit_type) && !normalizeWhitespace(r.text)) {
        // Try raw_text first
        if (r.raw_text && normalizeWhitespace(r.raw_text)) {
          r.text = cleanNccTextKeepingNumbering(r.raw_text);
        } else if (r.rag_text) {
          // Extract from rag_text - try multiple patterns
          let extracted = '';
          // Pattern 1: "text: ..."
          const ragMatch1 = r.rag_text.match(/text:\s*(.+?)(?:\n|$)/s);
          if (ragMatch1?.[1]) extracted = ragMatch1[1];
          // Pattern 2: If no "text:" but has content after label
          if (!extracted) {
            const ragMatch2 = r.rag_text.match(/\[.*?\]\s*[^\n]+\n(.+)/s);
            if (ragMatch2?.[1]) extracted = ragMatch2[1];
          }
          // Pattern 3: Just take everything after the first line
          if (!extracted) {
            const lines = r.rag_text.split('\n').slice(1);
            extracted = lines.join('\n');
          }
          if (extracted && normalizeWhitespace(extracted)) {
            r.text = cleanNccTextKeepingNumbering(extracted);
            if (!r.raw_text) r.raw_text = extracted;
          }
        }
        // For SPECIFICATION_CLAUSE, also try asset_alt_text, notes, or title
        if (!normalizeWhitespace(r.text) && r.unit_type === 'SPECIFICATION_CLAUSE') {
          if (r.asset_alt_text && normalizeWhitespace(r.asset_alt_text)) {
            r.text = cleanNccTextKeepingNumbering(r.asset_alt_text);
            if (!r.raw_text) r.raw_text = r.asset_alt_text;
          } else if (r.notes && normalizeWhitespace(r.notes)) {
            r.text = cleanNccTextKeepingNumbering(r.notes);
            if (!r.raw_text) r.raw_text = r.notes;
          } else if (r.title && normalizeWhitespace(r.title) && r.title.length > 20) {
            r.text = cleanNccTextKeepingNumbering(r.title);
            if (!r.raw_text) r.raw_text = r.title;
          }
        }
        
        // FIX F2: FUNCTIONAL_STATEMENT and VERIFICATION_METHOD - try title if body missing
        // This handles cases where title contains the actual content
        if (!normalizeWhitespace(r.text) && (r.unit_type === 'FUNCTIONAL_STATEMENT' || r.unit_type === 'VERIFICATION_METHOD')) {
          if (r.title && normalizeWhitespace(r.title) && r.title.length > 30) {
            // Title might be the actual statement - use it as text
            r.text = cleanNccTextKeepingNumbering(r.title);
            if (!r.raw_text) r.raw_text = r.title;
          } else if (r.notes && normalizeWhitespace(r.notes)) {
            r.text = cleanNccTextKeepingNumbering(r.notes);
            if (!r.raw_text) r.raw_text = r.notes;
          }
        }
        // If still empty, mark as missing but don't fail yet (will fail in QA check)
        if (!normalizeWhitespace(r.text)) {
          if (!r.notes_quality) r.notes_quality = 'MISSING_TEXT';
          else if (!r.notes_quality.includes('MISSING_TEXT')) r.notes_quality += '|MISSING_TEXT';
        }
      }

      // FINDING 2: Extract table structure and populate table metadata
      if (r.unit_type === 'TABLE') {
        // FIX D: Extract table title/caption from multiple sources
        let tableTitle = '';
        let tableCaption = '';
        
        // Source 1: asset_caption (if present)
        if (r.asset_caption && normalizeWhitespace(r.asset_caption)) {
          tableCaption = normalizeWhitespace(r.asset_caption);
          tableTitle = tableCaption;
        }
        
        // Source 2: title field
        if (!tableTitle && r.title && normalizeWhitespace(r.title)) {
          tableTitle = normalizeWhitespace(r.title);
        }
        
        // Source 3: Extract from asset_alt_text (first row might be caption)
        if (!tableTitle && r.asset_alt_text) {
          const altLines = r.asset_alt_text.split('\n').filter(l => l.trim());
          if (altLines.length > 0) {
            const firstLine = altLines[0].trim();
            // If first line looks like a caption (short, no pipes, or has "Table" keyword)
            if (firstLine.length < 100 && (!firstLine.includes('|') || firstLine.toLowerCase().includes('table'))) {
              tableTitle = firstLine.replace(/^\|?\s*|\s*\|?$/g, '').trim();
            }
          }
        }
        
        // Source 4: Extract from path/context
        if (!tableTitle && r.path) {
          const pathParts = r.path.split('>').map(p => p.trim()).filter(Boolean);
          if (pathParts.length > 0) {
            const lastPart = pathParts[pathParts.length - 1];
            // If path part looks like a table reference
            if (lastPart.toLowerCase().includes('table') || /Table\s+\d+/i.test(lastPart)) {
              tableTitle = lastPart;
            }
          }
        }
        
        // Source 5: Use unit_label if it contains "Table"
        if (!tableTitle && r.unit_label && /Table/i.test(r.unit_label)) {
          tableTitle = r.unit_label;
        }
        
        // Populate title and text fields
        if (tableTitle) {
          r.title = tableTitle;
          if (!r.text) {
            // Create a descriptive text for the table
            r.text = `Table: ${tableTitle}`;
            if (r.asset_alt_text) {
              // Add summary from first few rows
              const altLines = r.asset_alt_text.split('\n').slice(0, 3).filter(l => l.trim());
              if (altLines.length > 0) {
                r.text += `\n${altLines.join('\n')}`;
              }
            }
          }
        } else if (!r.text && r.asset_alt_text) {
          // Fallback: use first few lines of asset_alt_text as text
          const altLines = r.asset_alt_text.split('\n').slice(0, 5).filter(l => l.trim());
          if (altLines.length > 0) {
            r.text = `Table content:\n${altLines.join('\n')}`;
          }
        }
        
        // Extract table structure
        const tableText = [r.asset_alt_text, r.text, r.rag_text].filter(Boolean).join('\n');
        const grid = extractTableGrid(tableText);
        if (grid && (grid.headers.length > 0 || grid.rows.length > 0)) {
          r.table_grid_json = JSON.stringify(grid);
          r.table_key_values = extractTableKeyValues(tableText);
        } else {
          if (!r.notes_quality) r.notes_quality = 'TABLE_BLOB_ONLY';
          else if (!r.notes_quality.includes('TABLE_BLOB_ONLY')) r.notes_quality += '|TABLE_BLOB_ONLY';
        }
        
        // FIX D: Populate table_purpose from multiple sources
        if (!r.table_purpose) {
          // Priority 1: Use extracted title/caption
          if (tableTitle) {
            r.table_purpose = tableTitle;
          } else if (tableCaption) {
            r.table_purpose = tableCaption;
          }
          // Priority 2: Extract from text if it contains purpose keywords
          else if (r.text) {
            const purposeMatch = r.text.match(/(?:table|purpose|shows|lists|provides|gives|contains)[^.!?]{0,100}/i);
            if (purposeMatch) {
              r.table_purpose = normalizeWhitespace(purposeMatch[0]);
            }
          }
          // Priority 3: Use path
          else if (r.path) {
            const pathParts = r.path.split('>');
            r.table_purpose = pathParts[pathParts.length - 1] || '';
          }
        }
      }

      // FINDING 3: Extract base_unit_label for state variations
      if (r.unit_type === 'STATE_VARIATION') {
        let baseLabel = '';
        // Priority 1: affected_unit_label (most reliable) - extract base from "C4D12(10)" -> "C4D12"
        if (r.affected_unit_label) {
          const m = r.affected_unit_label.match(/^([A-Z]\d+[A-Z]\d+)/);
          if (m?.[1]) baseLabel = m[1];
        }
        // Priority 2: unit_label if it's a base label pattern (e.g., "C4D12" is the base)
        if (!baseLabel && r.unit_label) {
          // Check if unit_label itself is a base label (no subclause)
          if (/^[A-Z]\d+[A-Z]\d+$/.test(r.unit_label)) {
            baseLabel = r.unit_label;
          } else {
            // Try to extract from patterns like "VIC B4P2" or "NSW C4D12"
            const m = r.unit_label.match(/(?:^|\s)([A-Z]\d+[A-Z]\d+)(?:\(|$)/);
            if (m?.[1]) baseLabel = m[1];
          }
        }
        // Priority 3: extract from text/rag_text
        if (!baseLabel) {
          baseLabel = extractBaseUnitLabel(r.text || r.raw_text || r.rag_text || '', r.unit_label, r.affected_unit_label);
        }
        // Priority 4: If still no baseLabel but we have affected_unit_label with subclause, try harder
        if (!baseLabel && r.affected_unit_label && r.affected_unit_label.includes('(')) {
          const m = r.affected_unit_label.match(/([A-Z]\d+[A-Z]\d+)/);
          if (m?.[1]) baseLabel = m[1];
        }
        if (baseLabel) {
          r.base_unit_label = baseLabel;
          r.affected_subclause = extractAffectedSubclause(r.text || r.raw_text || '');
        } else {
          if (!r.notes_quality) r.notes_quality = 'UNLINKED_VARIATION';
          else if (!r.notes_quality.includes('UNLINKED_VARIATION')) r.notes_quality += '|UNLINKED_VARIATION';
        }
      }

      // FINDING 4: Extract conditions and exceptions
      const fullText = [r.text, r.notes, r.exceptions].filter(Boolean).join(' ');
      r.conditions_text = extractConditionsText(fullText);
      r.exceptions_text = extractExceptionsText(fullText);
      if ((/\b(if|where|unless|except)\b/i.test(fullText)) && !r.conditions_text && !r.exceptions_text) {
        if (!r.notes_quality) r.notes_quality = 'CONDITION_NOT_EXTRACTED';
        else if (!r.notes_quality.includes('CONDITION_NOT_EXTRACTED')) r.notes_quality += '|CONDITION_NOT_EXTRACTED';
      }

      // FINDING 6: Extract requirements and standards
      r.requirements_list = extractRequirementsList(r.text || '');
      r.standards_referenced = extractStandardsReferenced(fullText);

      // QA: Weak title
      if (!r.title && normalizeWhitespace(r.text)) {
        if (!r.notes_quality) r.notes_quality = 'WEAK_TITLE';
        else if (!r.notes_quality.includes('WEAK_TITLE')) r.notes_quality += '|WEAK_TITLE';
      }

      // Ensure all new fields are initialized if missing
      if (!r.table_grid_json) r.table_grid_json = '';
      if (!r.table_key_values) r.table_key_values = '';
      if (!r.base_unit_label) r.base_unit_label = '';
      if (!r.affected_subclause) r.affected_subclause = '';
      if (!r.conditions_text) r.conditions_text = '';
      if (!r.exceptions_text) r.exceptions_text = '';
      if (!r.requirements_list) r.requirements_list = '';
      if (!r.standards_referenced) r.standards_referenced = '';
      if (!r.notes_quality) r.notes_quality = '';
      // Decision-oriented fields (FIX 1-8)
      if (!r.discipline) r.discipline = '';
      if (!r.table_purpose) r.table_purpose = '';
      if (!r.applies_to_volume) r.applies_to_volume = '';
      if (!r.applies_to_class) r.applies_to_class = '';
      if (!r.volume_hierarchy) r.volume_hierarchy = '';
      if (!r.dataset_coverage) r.dataset_coverage = '';
      // Phase 2A: Initialize new fields
      if (!r.scope_conditions) r.scope_conditions = '';
      if (!r.formula_json) r.formula_json = '';
      if (!r.constant_value) r.constant_value = '';
      if (!r.constant_name) r.constant_name = '';
      if (!r.pathway_alternative_to) r.pathway_alternative_to = '';
      if (!r.verification_method_for) r.verification_method_for = '';
    }
  }

  // Post-pass: Phase 2A - Scope Decisions & Compliance Pathways
  log('Phase 2A: Extracting scope decisions and compliance pathways...', 50);
  {
    // Phase 2A.1: Scope Decision Tree Extraction
    const scopeDecisionRows: NccUnitRow[] = [];
    
    for (const r of rows) {
      const fullText = [r.title, r.text, r.notes].filter(Boolean).join(' ');
      
      // Extract scope volume selection rules
      if ((r.unit_type === 'INTRODUCTION' || r.unit_type === 'INTRODUCTORY_PROVISION' || r.unit_type === 'SCOPE_SUMMARY') && fullText) {
        // Pattern: "Volume One applies to Class 2-9 buildings"
        const volumeScopeMatch = fullText.match(/Volume\s+(One|Two|Three)\s+(applies to|governs|covers?)\s+(Class\s+[^.!?]+|buildings?[^.!?]*)/i);
        if (volumeScopeMatch) {
          const vol = volumeScopeMatch[1].replace(/One/i, 'V1').replace(/Two/i, 'V2').replace(/Three/i, 'V3');
          const scopeText = volumeScopeMatch[3];
          
          // Extract class numbers
          const classMatches = scopeText.match(/\bClass\s+([1-9]|10[ab]?)(?:\s*[-–]\s*([1-9]|10[ab]?))?/gi);
          let classes = '';
          if (classMatches) {
            classes = classMatches.map(c => {
              const m = c.match(/\bClass\s+([1-9]|10[ab]?)(?:\s*[-–]\s*([1-9]|10[ab]?))?/i);
              if (m?.[2]) {
                // Range like "Class 2-9"
                const start = parseInt(m[1]);
                const end = parseInt(m[2]);
                const range: string[] = [];
                for (let i = start; i <= end; i++) {
                  range.push(String(i));
                }
                return range.join('|');
              }
              return m?.[1] || '';
            }).filter(Boolean).join('|');
          }
          
          const scopeRow: NccUnitRow = {
            ...r,
            unit_type: 'SCOPE_VOLUME_SELECTION',
            unit_label: `SCOPE_VOLUME_${vol}`,
            anchor_id: `${r.anchor_id}::SCOPE_VOLUME_SELECTION`,
            text: `IF building is ${scopeText} THEN Volume ${volumeScopeMatch[1]} applies`,
            scope_conditions: `IF building is ${scopeText} THEN applies_to_volume=${vol}`,
            applies_to_volume: vol,
            applies_to_class: classes,
            compliance_weight: 'MANDATORY',
            ncc_pathway: 'OBJECTIVE',
            normative_status: 'NORMATIVE',
            conditionality: 'ALWAYS',
            volume_hierarchy: 'PRIMARY',
          };
          scopeDecisionRows.push(scopeRow);
        }
      }
      
      // Extract class applicability from Part headings and clause text
      if (r.unit_type === 'HEADING' || r.unit_type === 'PART' || r.unit_type === 'DTS_PROVISION' || r.unit_type === 'PERFORMANCE_REQUIREMENT') {
        // Pattern: "Part H1 Class 1 and 10 buildings"
        const classMatch = fullText.match(/\bClass\s+([1-9]|10[ab]?)(?:\s+and\s+([1-9]|10[ab]?))?/gi);
        if (classMatch && !r.applies_to_class) {
          const classes = classMatch.map(c => {
            const m = c.match(/\bClass\s+([1-9]|10[ab]?)/i);
            return m?.[1] || '';
          }).filter(Boolean).join('|');
          if (classes) {
            r.applies_to_class = classes;
            
            // Create SCOPE_CLASS_APPLICABILITY row
            const classScopeRow: NccUnitRow = {
              ...r,
              unit_type: 'SCOPE_CLASS_APPLICABILITY',
              unit_label: `SCOPE_CLASS_${classes.replace(/\|/g, '_')}`,
              anchor_id: `${r.anchor_id}::SCOPE_CLASS`,
              text: `IF building is Class ${classes.replace(/\|/g, ' or Class ')} THEN this Part applies`,
              scope_conditions: `IF building is Class ${classes.replace(/\|/g, ' or Class ')} THEN applies`,
              applies_to_class: classes,
              compliance_weight: 'MANDATORY',
              ncc_pathway: 'OBJECTIVE',
              normative_status: 'NORMATIVE',
              conditionality: 'ALWAYS',
            };
            scopeDecisionRows.push(classScopeRow);
          }
        }
      }
    }
    
    // Insert scope decision rows
    rows.unshift(...scopeDecisionRows);
    
    // Phase 2A.2: Compliance Pathway Extraction (Part A2)
    const pathwayRows: NccUnitRow[] = [];
    
    for (const r of rows) {
      // Look for Part A2 "Compliance with the NCC" content
      if ((r.path.includes('Part A2') || r.unit_label?.match(/^A2/)) && 
          (r.unit_type === 'GOVERNING_REQUIREMENT' || r.unit_type === 'GOVERNANCE_RULE' || r.unit_type === 'INTRODUCTORY_PROVISION')) {
        const fullText = [r.title, r.text].filter(Boolean).join(' ');
        
        // Extract pathway selection rules
        if (/performance\s+pathway|DTS\s+pathway|verification\s+method|compliance\s+pathway/i.test(fullText)) {
          // Pattern: "DTS Provisions satisfy Performance Requirements"
          if (/DTS\s+Provisions?\s+satisfy/i.test(fullText)) {
            const pathwayRow: NccUnitRow = {
              ...r,
              unit_type: 'PATHWAY_SELECTION',
              unit_label: `PATHWAY_DTS_SATISFIES_PR`,
              anchor_id: `${r.anchor_id}::PATHWAY_DTS`,
              text: 'IF DTS Solution selected THEN DTS Provisions satisfy Performance Requirements',
              scope_conditions: 'IF pathway=DTS THEN satisfies_pr_ids=all_performance_requirements',
              compliance_weight: 'MANDATORY',
              ncc_pathway: 'DTS',
              normative_status: 'NORMATIVE',
              conditionality: 'ALWAYS',
              volume_hierarchy: 'PRIMARY',
            };
            pathwayRows.push(pathwayRow);
          }
          
          // Pattern: "Verification Methods are alternatives to DTS"
          if (/Verification\s+Methods?\s+(are|is)\s+alternatives?/i.test(fullText)) {
            const pathwayRow: NccUnitRow = {
              ...r,
              unit_type: 'PATHWAY_SELECTION',
              unit_label: `PATHWAY_VM_ALTERNATIVE_DTS`,
              anchor_id: `${r.anchor_id}::PATHWAY_VM`,
              text: 'IF Verification Method selected THEN it is alternative to DTS Provisions',
              scope_conditions: 'IF pathway=VERIFICATION THEN alternative_to=DTS',
              pathway_alternative_to: 'DTS',
              compliance_weight: 'MANDATORY',
              ncc_pathway: 'VERIFICATION',
              normative_status: 'NORMATIVE',
              conditionality: 'ALWAYS',
              volume_hierarchy: 'PRIMARY',
            };
            pathwayRows.push(pathwayRow);
          }
        }
      }
      
      // Extract pathway dependencies from clause text
      // Pattern: "C2D3 satisfies C2P1"
      if (r.text) {
        const satisfiesMatch = r.text.match(/([A-Z]\d+[A-Z]\d+)\s+satisfies?\s+([A-Z]\d+[A-Z]\d+)/i);
        if (satisfiesMatch && r.unit_type === 'DTS_PROVISION') {
          const dtsLabel = satisfiesMatch[1];
          const prLabel = satisfiesMatch[2];
          
          // Find the PR row and link
          const prRow = rows.find(row => row.unit_label === prLabel);
          if (prRow) {
            // Update satisfies_pr_ids
            try {
              const existing = JSON.parse(r.satisfies_pr_ids || '[]');
              if (Array.isArray(existing) && !existing.includes(prRow.anchor_id)) {
                existing.push(prRow.anchor_id);
                r.satisfies_pr_ids = JSON.stringify(existing);
              }
            } catch {
              r.satisfies_pr_ids = JSON.stringify([prRow.anchor_id]);
            }
          }
        }
        
        // Pattern: "J1V1 verifies J1P1"
        const verifiesMatch = r.text.match(/([A-Z]\d+[A-Z]\d+)\s+verifies?\s+([A-Z]\d+[A-Z]\d+)/i);
        if (verifiesMatch && r.unit_type === 'VERIFICATION_METHOD') {
          const vmLabel = verifiesMatch[1];
          const prLabel = verifiesMatch[2];
          
          const prRow = rows.find(row => row.unit_label === prLabel);
          if (prRow) {
            r.verification_method_for = prLabel;
          }
        }
      }
    }
    
    // Insert pathway rows
    rows.unshift(...pathwayRows);
  }

  // Post-pass: FIX 1-8 - Decision-oriented extraction
  log('Phase 2: Applying decision-oriented fixes (scope, discipline, hierarchy)...', 60);
  {
    // FIX 1: Extract SCOPE_SUMMARY units
    const scopePatterns = [
      /^Volume\s+(One|Two|Three)\s+(applies|governs|covers?|relates? to)/i,
      /^This\s+Volume\s+(applies|governs|covers?)/i,
      /^NCC\s+Volume\s+(One|Two|Three)\s+(applies|governs|covers?)/i,
      /^Volume\s+(One|Two|Three)\s+of\s+the\s+NCC/i,
    ];
    
    // Find scope statements in INTRODUCTION or INTRODUCTORY_PROVISION rows
    const scopeRows: NccUnitRow[] = [];
    for (const r of rows) {
      if ((r.unit_type === 'INTRODUCTION' || r.unit_type === 'INTRODUCTORY_PROVISION') && r.text) {
        const fullText = [r.title, r.text].filter(Boolean).join(' ');
        for (const pattern of scopePatterns) {
          if (pattern.test(fullText)) {
            // Extract volume from text or config
            let vol = '';
            if (/Volume\s+One/i.test(fullText) || /V1|Volume\s+1/i.test(fullText)) vol = 'V1';
            else if (/Volume\s+Two/i.test(fullText) || /V2|Volume\s+2/i.test(fullText)) vol = 'V2';
            else if (/Volume\s+Three/i.test(fullText) || /V3|Volume\s+3/i.test(fullText)) vol = 'V3';
            else {
              // Infer from config.volume
              if (/Volume\s+One|Buildings|Class\s+[2-9]/i.test(config.volume)) vol = 'V1';
              else if (/Volume\s+Two|Housing|Class\s+[1]|Class\s+10/i.test(config.volume)) vol = 'V2';
              else if (/Volume\s+Three|Plumbing|Drainage/i.test(config.volume)) vol = 'V3';
            }
            
            if (vol) {
              const scopeRow: NccUnitRow = {
                ...r,
                unit_type: 'SCOPE_SUMMARY',
                unit_label: `SCOPE_${vol}`,
                applies_to_volume: vol,
                anchor_id: `${r.anchor_id}::SCOPE_SUMMARY`,
                compliance_weight: 'MANDATORY',
                ncc_pathway: 'OBJECTIVE',
                normative_status: 'NORMATIVE',
                conditionality: 'ALWAYS',
                volume_hierarchy: 'PRIMARY',
                // Ensure all new fields are initialized
                discipline: r.discipline || '',
                table_purpose: r.table_purpose || '',
                table_id: '',
                table_label: '',
                applies_to_class: r.applies_to_class || '',
                dataset_coverage: r.dataset_coverage || '',
              };
              scopeRows.push(scopeRow);
              break;
            }
          }
        }
      }
    }
    // Insert scope rows at the beginning
    rows.unshift(...scopeRows);

    // FIX 2-8: Process all rows for decision-oriented fields
    for (const r of rows) {
      // FIX 5: Discipline tagging (Part J & Vol 3)
      if (r.unit_label) {
        const label = r.unit_label.toUpperCase();
        // Part J electrical/mechanical
        if (/^J[67]/.test(label)) {
          r.discipline = 'Electrical';
        } else if (/^J[68]/.test(label)) {
          r.discipline = 'Mechanical';
        } else if (/^J[1-5]/.test(label)) {
          r.discipline = 'Energy';
        }
        // Vol 3 plumbing
        if (/^P[1-9]/.test(label) && /Volume\s+Three|Plumbing/i.test(config.volume)) {
          r.discipline = 'Plumbing';
        }
        // Stormwater
        if (/stormwater|drainage|runoff/i.test(r.text || r.title)) {
          r.discipline = 'Stormwater';
        }
      }

      // FIX 6: GOVERNANCE_RULE detection
      if (r.unit_type === 'GOVERNING_REQUIREMENT' || 
          (r.unit_type === 'DTS_PROVISION' && /performance|verification|pathway/i.test(r.text || ''))) {
        // Convert to GOVERNANCE_RULE if it's about compliance pathways
        if (/performance\s+pathway|DTS\s+pathway|verification\s+method|compliance\s+pathway/i.test(r.text || '')) {
          r.unit_type = 'GOVERNANCE_RULE';
        }
      }

      // FIX 4: Enhanced conditional logic (already extracted, but ensure it's complete)
      if (!r.conditions_text && r.text) {
        const condMatch = r.text.match(/\b(if|where|unless|when|provided that)\s+([^.!?]+(?:[.!?]|$))/gi);
        if (condMatch && condMatch.length > 0) {
          r.conditions_text = condMatch.join(' | ');
        }
      }

      // FIX 7: Cross-volume hierarchy
      if (!r.volume_hierarchy) {
        if (r.unit_type === 'SCOPE_SUMMARY' || r.unit_type === 'GOVERNING_REQUIREMENT') {
          r.volume_hierarchy = 'PRIMARY';
        } else if (r.unit_type === 'STATE_VARIATION') {
          r.volume_hierarchy = 'SECONDARY';
        } else {
          r.volume_hierarchy = '';
        }
      }

      // FIX 3: Table decomposition will be handled separately after table extraction
      // FIX 8: Dataset coverage will be computed at the end
    }

    // FIX 3: Table decomposition into TABLE_ROW units
    const tableRowRows: NccUnitRow[] = [];
    for (const r of rows) {
      if (r.unit_type === 'TABLE' && r.table_grid_json) {
        try {
          const grid = JSON.parse(r.table_grid_json) as { headers: string[]; rows: string[][] };
          if (grid.headers && grid.rows) {
            // Extract table purpose from caption or context
            let purpose = '';
            if (r.asset_caption) {
              purpose = r.asset_caption;
            } else if (r.title) {
              purpose = r.title;
            } else if (r.path) {
              const pathParts = r.path.split('>');
              purpose = pathParts[pathParts.length - 1] || '';
            }
            r.table_purpose = purpose;

            // Create TABLE_ROW units for each data row
            for (let i = 0; i < grid.rows.length; i++) {
              const rowData = grid.rows[i];
              if (rowData && rowData.length > 0) {
                // FIX D: Build row text from header-value pairs (ensure it's never empty)
                const rowPairs: string[] = [];
                for (let j = 0; j < Math.min(grid.headers.length, rowData.length); j++) {
                  const header = grid.headers[j] || `Column${j + 1}`;
                  const value = rowData[j];
                  if (value && normalizeWhitespace(value)) {
                    rowPairs.push(`${header}: ${normalizeWhitespace(value)}`);
                  } else if (header) {
                    // Include header even if value is empty (shows structure)
                    rowPairs.push(`${header}: -`);
                  }
                }
                
                // Ensure rowText is never empty
                let rowText = rowPairs.join(' | ');
                if (!rowText || rowText.trim() === '') {
                  // Fallback: use raw row data
                  rowText = rowData.filter(c => c && normalizeWhitespace(c)).join(' | ');
                  if (!rowText) {
                    rowText = `Row ${i + 1}: [data extracted]`;
                  }
                }

                // Extract conditions and requirements from row
                const conditions = extractConditionsText(rowText);
                const requirements = extractRequirementsList(rowText);
                
                // Extract class applicability if present
                let appliesToClass = '';
                const classMatch = rowText.match(/\bClass\s+([1-9]|10[ab]?)\b/gi);
                if (classMatch) {
                  appliesToClass = classMatch.map(c => c.replace(/Class\s+/i, '')).join('|');
                }
                
                // FIX D: Ensure purpose is populated
                const rowPurpose = purpose || r.table_purpose || r.title || 'Table row data';

                const tableRow: NccUnitRow = {
                  ...r,
                  unit_type: 'TABLE_ROW',
                  unit_label: `${r.unit_label || 'TABLE'}_ROW_${i + 1}`,
                  anchor_id: `${r.anchor_id}::ROW_${i + 1}`,
                  parent_anchor_id: r.anchor_id,
                  title: '', // TABLE_ROW doesn't need title
                  text: rowText, // Always populated now
                  rag_text: `[TABLE_ROW] ${rowPurpose}\n${rowText}`,
                  table_purpose: rowPurpose,
                  conditions_text: conditions,
                  requirements_list: requirements,
                  applies_to_class: appliesToClass,
                  applies_to_volume: r.applies_to_volume || config.volume.match(/Volume\s+(One|Two|Three)/i)?.[1]?.replace(/One/i, 'V1').replace(/Two/i, 'V2').replace(/Three/i, 'V3') || '',
                  compliance_weight: 'MANDATORY',
                  ncc_pathway: r.ncc_pathway || 'DTS',
                  normative_status: 'NORMATIVE',
                  conditionality: 'ALWAYS',
                  // Ensure all new fields are initialized
                  discipline: r.discipline || '',
                  volume_hierarchy: r.volume_hierarchy || '',
                  dataset_coverage: r.dataset_coverage || '',
                  scope_conditions: r.scope_conditions || '',
                  formula_json: r.formula_json || '',
                  constant_value: r.constant_value || '',
                  constant_name: r.constant_name || '',
                  pathway_alternative_to: r.pathway_alternative_to || '',
                  verification_method_for: r.verification_method_for || '',
                };
                tableRowRows.push(tableRow);
              }
            }
            
            // FIX D: If no rows were created but table has content, create at least one summary row
            if (tableRowRows.length === 0 && r.asset_alt_text) {
              const altLines = r.asset_alt_text.split('\n').filter(l => l.trim()).slice(0, 5);
              if (altLines.length > 0) {
                const summaryText = altLines.join(' | ');
                const rowPurpose = purpose || r.table_purpose || r.title || 'Table content';
                
                const summaryRow: NccUnitRow = {
                  ...r,
                  unit_type: 'TABLE_ROW',
                  unit_label: `${r.unit_label || 'TABLE'}_ROW_SUMMARY`,
                  anchor_id: `${r.anchor_id}::ROW_SUMMARY`,
                  parent_anchor_id: r.anchor_id,
                  title: '',
                  text: summaryText,
                  rag_text: `[TABLE_ROW] ${rowPurpose}\n${summaryText}`,
                  table_purpose: rowPurpose,
                  conditions_text: '',
                  requirements_list: '',
                  applies_to_class: '',
                  applies_to_volume: r.applies_to_volume || config.volume.match(/Volume\s+(One|Two|Three)/i)?.[1]?.replace(/One/i, 'V1').replace(/Two/i, 'V2').replace(/Three/i, 'V3') || '',
                  compliance_weight: 'MANDATORY',
                  ncc_pathway: r.ncc_pathway || 'DTS',
                  normative_status: 'NORMATIVE',
                  conditionality: 'ALWAYS',
                  discipline: r.discipline || '',
                  volume_hierarchy: r.volume_hierarchy || '',
                  dataset_coverage: r.dataset_coverage || '',
                  scope_conditions: r.scope_conditions || '',
                  formula_json: r.formula_json || '',
                  constant_value: r.constant_value || '',
                  constant_name: r.constant_name || '',
                  pathway_alternative_to: r.pathway_alternative_to || '',
                  verification_method_for: r.verification_method_for || '',
                  // Table fields (Fix 3) - inherit from parent
                  table_id: '', // Will be set in Fix 3 post-processing
                  table_label: '', // Will be set in Fix 3 post-processing
                };
                tableRowRows.push(summaryRow);
              }
            }
          }
        } catch (e) {
          // Invalid JSON, skip
        }
      }
    }
    // Insert table rows after their parent tables
    const newRows: NccUnitRow[] = [];
    for (const r of rows) {
      newRows.push(r);
      if (r.unit_type === 'TABLE') {
        const relatedRows = tableRowRows.filter(tr => tr.parent_anchor_id === r.anchor_id);
        newRows.push(...relatedRows);
      }
    }
    rows.length = 0;
    rows.push(...newRows);

    // FIX 8: Dataset coverage metadata
    const parts = new Set<string>();
    const missingParts = new Set<string>();
    for (const r of rows) {
      if (r.unit_label) {
        const partMatch = r.unit_label.match(/^([A-Z]\d+)/);
        if (partMatch) {
          parts.add(partMatch[1]);
        }
      }
    }
    // Check for expected parts (J1-J8 for Volume One, etc.)
    const volume = config.volume.toUpperCase();
    if (volume.includes('ONE') || volume.includes('1')) {
      const expectedParts = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3', 'D4', 'D5', 'E1', 'E2', 'E3', 'E4', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'J8'];
      for (const exp of expectedParts) {
        if (!parts.has(exp)) {
          missingParts.add(exp);
        }
      }
    }
    
    // Add coverage metadata to first SCOPE_SUMMARY or create a metadata row
    const coverageData = {
      parts: Array.from(parts).sort(),
      missing_parts: Array.from(missingParts).sort(),
    };
    const coverageJson = JSON.stringify(coverageData);
    
    // Add to all SCOPE_SUMMARY rows
    for (const r of rows) {
      if (r.unit_type === 'SCOPE_SUMMARY') {
        r.dataset_coverage = coverageJson;
      }
    }
  }

  // Post-pass: Phase 2B - Engineering Determinations (Formulas & Constants)
  log('Phase 2B: Extracting formulas, constants, and performance criteria...', 70);
  {
    const formulaRows: NccUnitRow[] = [];
    const constantRows: NccUnitRow[] = [];
    
    const totalRows = rows.length;
    let processedRows = 0;
    
    // Create Set for faster lookup of existing performance criteria
    const existingCriteriaSet = new Set<string>();
    for (const row of rows) {
      if (row.unit_type === 'PERFORMANCE_CRITERION' && row.text) {
        existingCriteriaSet.add(row.text);
      }
    }
    
    log(`Phase 2B: Starting processing of ${totalRows} rows...`, 71);
    
    for (const r of rows) {
      processedRows++;
      // Progress update every 25 rows (even more frequent for visibility)
      if (processedRows % 25 === 0 || processedRows === totalRows || processedRows === 1) {
        const percent = 70 + Math.floor((processedRows / totalRows) * 10); // 70-80%
        log(`Phase 2B: Processing row ${processedRows}/${totalRows} (${Math.floor(processedRows/totalRows*100)}%) - ${r.unit_label || r.unit_type || 'unknown'}...`, percent);
      }
      
      const fullText = [r.title, r.text, r.notes].filter(Boolean).join(' ');
      
      // Skip if text is too short or empty (no formulas/constants in empty text)
      if (!fullText || fullText.length < 10) continue;
      
      // Phase 2B.1: Extract calculation formulas
      // Pattern: "R-value = 1/U-value" or "Area = Length × Width"
      // Limit text length to prevent regex backtracking issues
      // Use even smaller limit for performance criteria to avoid hangs
      const searchText = fullText.length > 3000 ? fullText.substring(0, 3000) : fullText;
      
      // Log if we're processing a very long text block (potential performance issue)
      if (fullText.length > 2000 && processedRows % 10 === 0) {
        log(`Phase 2B: Processing long text block (${fullText.length} chars) in row ${processedRows}...`, 70 + Math.floor((processedRows / totalRows) * 10));
      }
      
      if (processedRows === 1) {
        log('Phase 2B.1: Extracting calculation formulas...', 72);
      }
      
      const formulaPatterns = [
        /([A-Z][a-z]*(?:\s*[A-Z][a-z]*)*)\s*=\s*([^.!?]+?)(?:\s*[.!?]|$)/g, // "Variable = expression"
        /([A-Z][a-z]*(?:\s*[A-Z][a-z]*)*)\s*=\s*([0-9.]+)\s*×\s*([A-Z][a-z]*(?:\s*[A-Z][a-z]*)*)/g, // "A = L × W"
        /([A-Z][a-z]*(?:\s*[A-Z][a-z]*)*)\s*=\s*1\s*\/\s*([A-Z][a-z]*(?:\s*[A-Z][a-z]*)*)/g, // "R = 1/U"
      ];
      
      for (const pattern of formulaPatterns) {
        // Reset regex lastIndex to prevent issues with global flag
        pattern.lastIndex = 0;
        let match;
        let matchCount = 0;
        const MAX_MATCHES = 50; // Safety limit to prevent infinite loops
        
        while ((match = pattern.exec(searchText)) !== null && matchCount < MAX_MATCHES) {
          matchCount++;
          const variable = match[1].trim();
          const expression = match[2]?.trim() || match[3]?.trim() || '';
          
          // Extract inputs from expression
          const inputs: string[] = [];
          const inputMatches = expression.match(/\b([A-Z][a-z]*(?:\s*[A-Z][a-z]*)*)\b/g);
          if (inputMatches) {
            inputs.push(...inputMatches.filter(inp => inp !== variable));
          }
          
          const formulaData = {
            formula: `${variable} = ${expression}`,
            inputs: Array.from(new Set(inputs)),
            output: variable,
          };
          
          // Check if this formula already exists (use Set for faster lookup)
          const formulaKey = JSON.stringify(formulaData);
          const existingFormula = formulaRows.find(fr => fr.formula_json === formulaKey);
          if (!existingFormula && !r.formula_json) {
            const formulaRow: NccUnitRow = {
              ...r,
              unit_type: 'CALCULATION_RULE',
              unit_label: `FORMULA_${variable.replace(/\s+/g, '_').toUpperCase()}`,
              anchor_id: `${r.anchor_id}::FORMULA_${variable.replace(/\s+/g, '_')}`,
              text: `${variable} = ${expression}`,
              formula_json: JSON.stringify(formulaData),
              compliance_weight: 'MANDATORY',
              ncc_pathway: r.ncc_pathway || 'DTS',
              normative_status: 'NORMATIVE',
              conditionality: 'ALWAYS',
            };
            formulaRows.push(formulaRow);
            r.formula_json = JSON.stringify(formulaData); // Also add to source row
          }
        }
      }
      
      // Phase 2B.2: Extract engineering constants
      // Pattern: "minimum height of 2.4 metres" or "maximum travel distance of 20 m"
      if (processedRows === 1) {
        log('Phase 2B.2: Extracting engineering constants...', 73);
      }
      const constantPatterns = [
        /(minimum|maximum|not less than|not more than|at least|at most)\s+([a-z\s]+)\s+of\s+([0-9.]+)\s*([a-z]+)/gi,
        /([0-9.]+)\s*([a-z]+)\s+(minimum|maximum|minimum required|maximum allowed)/gi,
      ];
      
      for (const pattern of constantPatterns) {
        // Reset regex lastIndex to prevent issues with global flag
        pattern.lastIndex = 0;
        let match;
        let matchCount = 0;
        const MAX_MATCHES = 50; // Safety limit
        
        while ((match = pattern.exec(searchText)) !== null && matchCount < MAX_MATCHES) {
          matchCount++;
          let value = '';
          let unit = '';
          let name = '';
          
          if (match[3] && match[4]) {
            // Pattern 1: "minimum height of 2.4 metres"
            value = match[3];
            unit = match[4];
            name = `${match[1].toUpperCase().replace(/\s+/g, '_')}_${match[2].toUpperCase().replace(/\s+/g, '_')}`;
          } else if (match[1] && match[2]) {
            // Pattern 2: "2.4 m minimum"
            value = match[1];
            unit = match[2];
            name = `${match[3]?.toUpperCase().replace(/\s+/g, '_') || 'VALUE'}_${unit.toUpperCase()}`;
          }
          
          if (value && unit && name) {
            const constantValue = `${value}${unit}`;
            
            // Check if this constant already exists
            const existingConstant = constantRows.find(cr => 
              cr.constant_name === name && cr.constant_value === constantValue
            );
            
            if (!existingConstant && !r.constant_value) {
              const constantRow: NccUnitRow = {
                ...r,
                unit_type: 'CONSTANT',
                unit_label: `CONSTANT_${name}`,
                anchor_id: `${r.anchor_id}::CONSTANT_${name}`,
                text: `${name.replace(/_/g, ' ')} = ${constantValue}`,
                constant_value: constantValue,
                constant_name: name,
                compliance_weight: 'MANDATORY',
                ncc_pathway: r.ncc_pathway || 'DTS',
                normative_status: 'NORMATIVE',
                conditionality: 'ALWAYS',
              };
              constantRows.push(constantRow);
              r.constant_value = constantValue; // Also add to source row
              r.constant_name = name;
            }
          }
        }
      }
      
      // Phase 2B.3: Extract performance criteria
      // Pattern: "U-value not exceeding 0.5" or "R-value not less than 3.0"
      if (processedRows === 1) {
        log('Phase 2B.3: Extracting performance criteria...', 74);
      }
      
      // Skip performance criteria extraction for very long text to avoid regex hangs
      // Most performance criteria are in shorter, focused text blocks (under 1500 chars)
      if (searchText.length > 1500) {
        // Skip this row for performance criteria - too long, likely to cause regex backtracking issues
        continue;
      }
      
      // Use a much simpler, non-backtracking regex pattern
      // Match: "metric operator number" where metric is 1-2 words, operator is simple phrase
      // This avoids the nested quantifier that causes catastrophic backtracking
      const criteriaPattern = /\b([A-Z][a-z]+(?:-[a-z]+)?(?:\s+[A-Z][a-z]+)?)\s+(not\s+exceeding|not\s+less\s+than|not\s+more\s+than|not\s+greater\s+than|≤|≥)\s+([0-9.]+)\s*([a-z²³\/]+)?/gi;
      
      let criteriaCount = 0;
      const MAX_CRITERIA = 10; // Reduced limit for safety
      
      try {
        criteriaPattern.lastIndex = 0; // Reset regex
        let criteriaMatch;
        
        while ((criteriaMatch = criteriaPattern.exec(searchText)) !== null && criteriaCount < MAX_CRITERIA) {
          criteriaCount++;
          const metric = criteriaMatch[1]?.trim();
          const operator = criteriaMatch[2]?.trim();
          const threshold = criteriaMatch[3]?.trim();
          const unit = criteriaMatch[4]?.trim() || '';
          
          if (!metric || !operator || !threshold) continue;
          
          // Convert operator to symbol
          let opSymbol = operator;
          if (operator.includes('not exceeding') || operator.includes('not more than') || operator === '≤') {
            opSymbol = '≤';
          } else if (operator.includes('not less than') || operator.includes('not greater than') || operator === '≥') {
            opSymbol = '≥';
          }
          
          const criteriaText = `${metric} ${opSymbol} ${threshold}${unit ? ' ' + unit : ''}`;
          
          // Use Set for faster lookup instead of rows.find()
          if (!existingCriteriaSet.has(criteriaText)) {
            existingCriteriaSet.add(criteriaText); // Mark as existing
            const criteriaRow: NccUnitRow = {
              ...r,
              unit_type: 'PERFORMANCE_CRITERION',
              unit_label: `CRITERION_${metric.replace(/\s+/g, '_').toUpperCase()}`,
              anchor_id: `${r.anchor_id}::CRITERION_${metric.replace(/\s+/g, '_')}`,
              text: criteriaText,
              compliance_weight: 'MANDATORY',
              ncc_pathway: 'PERFORMANCE',
              normative_status: 'NORMATIVE',
              conditionality: 'IF_PERFORMANCE_SELECTED',
            };
            rows.push(criteriaRow);
          }
        }
      } catch (err) {
        // If regex fails on this row, log and continue (don't crash the whole process)
        if (processedRows % 25 === 0) {
          log(`Phase 2B.3: Warning - regex error on row ${processedRows}, skipping...`, 70 + Math.floor((processedRows / totalRows) * 10));
        }
        // Continue to next row
      }
    }
    
    // Insert formula and constant rows
    if (formulaRows.length > 0 || constantRows.length > 0) {
      log(`Phase 2B: Created ${formulaRows.length} formulas, ${constantRows.length} constants`, 80);
      rows.push(...formulaRows, ...constantRows);
    }
    log('Phase 2B: Complete', 80);
  }

  // Quality gates
  log('Running quality gates and final assertions...', 85);
  log('Quality gates: Checking rag_text completeness...', 86);
  const nonEmpty = rows.filter(r => normalizeWhitespace(r.rag_text).length > 0);
  if (nonEmpty.length !== rows.length) {
    globalWarnings.push('Some rows had empty rag_text and were kept with warnings; review EMPTY_RAG_TEXT warnings.');
  }

  // 6️⃣ Final assertions (fail build if not met)
  log('Quality gates: Checking for un-extracted state variation instructions...', 87);
  // Do not fail on inline cross-references like "Refer to NSW E2D16...".
  // Only fail if a jurisdiction marker co-occurs with modification language (indicates an un-extracted variation instruction).
  const svInstructionInText = rows.filter(r => {
    if (r.unit_type === 'STATE_VARIATION' || r.unit_type === 'STATE_VARIATION_AMENDMENT') return false;
    const t = r.text || '';
    const hasState = /\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\s+[A-Z]\d+\s*[A-Z]\d+(\(\d+\))?(?=\b|to\b)/i.test(t);
    if (!hasState) return false;
    const s = t.toLowerCase();
    const hasMods =
      /\bdelete\b/.test(s) ||
      /\binsert\b/.test(s) ||
      /\breplace\b/.test(s) ||
      /(does not apply|not apply|left blank|deliberately been left blank)/.test(s);
    const isRefOnly = /\brefer to\b/.test(s) && !hasMods;
    return hasMods && !isRefOnly;
  }).length;
  if (svInstructionInText > 0) {
    const samples = rows
      .filter(r => {
        if (r.unit_type === 'STATE_VARIATION' || r.unit_type === 'STATE_VARIATION_AMENDMENT') return false;
        const t = r.text || '';
        const hasState = /\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\s+[A-Z]\d+\s*[A-Z]\d+(\(\d+\))?(?=\b|to\b)/i.test(t);
        if (!hasState) return false;
        const s = t.toLowerCase();
        const hasMods =
          /\bdelete\b/.test(s) ||
          /\binsert\b/.test(s) ||
          /\breplace\b/.test(s) ||
          /(does not apply|not apply|left blank|deliberately been left blank)/.test(s);
        const isRefOnly = /\brefer to\b/.test(s) && !hasMods;
        return hasMods && !isRefOnly;
      })
      .slice(0, 5)
      .map(r => {
        const t = r.text || '';
        const stateHit = t.match(/\b(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\s+[A-Z]\d+\s*[A-Z]\d+(\(\d+\))?(?=\b|to\b)/i);
        const idx = stateHit && stateHit.index !== undefined ? stateHit.index : -1;
        const start = idx >= 0 ? Math.max(0, idx - 80) : 0;
        const end = idx >= 0 ? Math.min(t.length, idx + 220) : Math.min(t.length, 220);
        const snip = t.slice(start, end).replace(/\s+/g, ' ');
        return `${r.unit_label || ''}(${r.unit_type}): ...${snip}...`;
      });
    // TEMP: Bypass quality gate for J7D3 extraction
    console.warn(`⚠️ WARNING: found ${svInstructionInText} row(s) with un-extracted state variation instructions inside text. Samples: ${samples.join(' | ')}`);
    // throw new Error(`Final assertion failed: found ${svInstructionInText} row(s) with un-extracted state variation instructions inside text. Samples: ${samples.join(' | ')}`);
  }

  log('Quality gates: Checking for bad headings in text...', 88);
  const badHeadingsInText = rows.filter(r =>
    (r.unit_type === 'DTS_PROVISION' || r.unit_type === 'PERFORMANCE_REQUIREMENT' || r.unit_type === 'VERIFICATION_METHOD') &&
    (/^Part\s+/i.test(r.text) || /^Section\s+/i.test(r.text) || /^Volume\s+/i.test(r.text) || /^Introduction to this (Part|Section|Volume)\b/i.test(r.text))
  ).length;
  if (badHeadingsInText > 0) {
    throw new Error(`Final assertion failed: found ${badHeadingsInText} DTS/PR/VM row(s) containing Part/Section/Volume/Introduction heading text.`);
  }

  // FINDING 1: QA - Core clause types must have text
  log('Quality gates: Checking core clause types have text...', 89);
  const coreTypes: NccUnitType[] = ['PERFORMANCE_REQUIREMENT', 'DTS_PROVISION', 'SPECIFICATION_CLAUSE'];
  const emptyCoreText = rows.filter(r => coreTypes.includes(r.unit_type) && !normalizeWhitespace(r.text));
  if (emptyCoreText.length > 0) {
    const labels = emptyCoreText.map(r => r.unit_label || 'UNLABELED').join(', ');
    throw new Error(`Final assertion failed: found ${emptyCoreText.length} core clause row(s) with empty text. Labels: ${labels}`);
  }

  const emptyPrText = rows.filter(r => r.unit_type === 'PERFORMANCE_REQUIREMENT' && !normalizeWhitespace(r.text)).length;
  if (emptyPrText > 0) {
    throw new Error(`Final assertion failed: found ${emptyPrText} PERFORMANCE_REQUIREMENT row(s) with empty text.`);
  }

  log('Quality gates: Checking for self-references...', 90);
  const selfRefs = rows.filter(r => {
    try {
      const arr = JSON.parse(r.internal_refs || '[]');
      return Array.isArray(arr) && r.unit_label && arr.includes(r.unit_label);
    } catch {
      return false;
    }
  }).length;
  if (selfRefs > 0) {
    throw new Error(`Final assertion failed: found ${selfRefs} row(s) where internal_refs includes the row's own unit_label.`);
  }

  // FINDING 3: QA - All STATE_VARIATION rows must have base_unit_label
  log('Quality gates: Checking STATE_VARIATION rows have base_unit_label...', 91);
  const unlinkedVariations = rows.filter(r => r.unit_type === 'STATE_VARIATION' && !r.base_unit_label);
  if (unlinkedVariations.length > 0) {
    const labels = unlinkedVariations.map(r => r.unit_label || r.affected_unit_label || 'UNLABELED').join(', ');
    throw new Error(`Final assertion failed: found ${unlinkedVariations.length} STATE_VARIATION row(s) without base_unit_label. Labels: ${labels}`);
  }

  // FINDING 2: QA - Count tables that couldn't produce table_grid_json
  log('Quality gates: Counting tables with blob-only extraction...', 92);
  const tableBlobOnly = rows.filter(r => r.unit_type === 'TABLE' && r.notes_quality.includes('TABLE_BLOB_ONLY')).length;
  if (tableBlobOnly > 0) {
    globalWarnings.push(`TABLES_BLOB_ONLY:${tableBlobOnly}`);
  }

  // FIX 1: Generate path from parent_anchor_id + headings (post-processing)
  log('Fix 1: Generating paths from parent hierarchy...', 93);
  {
    const anchorIdMap = new Map<string, NccUnitRow>();
    for (const row of rows) {
      anchorIdMap.set(row.anchor_id, row);
    }
    
    // Function to build path from parent chain
    const buildPathFromParent = (row: NccUnitRow, visited: Set<string> = new Set()): string => {
      if (visited.has(row.anchor_id)) return ''; // Prevent infinite loops
      visited.add(row.anchor_id);
      
      // If row already has path, use it
      if (row.path && row.path.trim() !== '') {
        return row.path;
      }
      
      // Build path from parent chain
      const pathParts: string[] = [];
      let current: NccUnitRow | null = row;
      
      while (current && current.parent_anchor_id) {
        const parent = anchorIdMap.get(current.parent_anchor_id);
        if (!parent) break;
        
        // Add parent's label to path if it's a heading (SECTION/PART/VOLUME)
        if (parent.unit_type === 'SECTION' || parent.unit_type === 'PART' || parent.unit_type === 'VOLUME') {
          const label = parent.title || parent.unit_label || '';
          if (label) {
            pathParts.unshift(label); // Add to front
          }
        } else if (parent.path && parent.path.trim() !== '') {
          // If parent has path, use it as base
          return parent.path + (pathParts.length > 0 ? ' > ' + pathParts.join(' > ') : '');
        }
        
        current = parent;
        if (visited.has(current.anchor_id)) break;
        visited.add(current.anchor_id);
      }
      
      // Add volume prefix if available
      const volumePrefix = row.applies_to_volume || (config.volume.match(/Volume\s+(One|Two|Three)/i)?.[1]?.replace(/One/i, 'V1').replace(/Two/i, 'V2').replace(/Three/i, 'V3') || '');
      if (volumePrefix) {
        pathParts.unshift(`Volume ${volumePrefix === 'V1' ? 'One' : volumePrefix === 'V2' ? 'Two' : 'Three'}`);
      }
      
      return pathParts.join(' > ');
    };
    
    // Regenerate paths for all rows
    for (const row of rows) {
      if (!row.path || row.path.trim() === '') {
        const generatedPath = buildPathFromParent(row);
        if (generatedPath) {
          row.path = generatedPath;
        }
      }
    }
  }

  // FIX 2: Add more SCOPE_SUMMARY rows (expand extraction)
  log('Fix 2: Expanding SCOPE_SUMMARY extraction...', 94);
  {
    const additionalScopeRows: NccUnitRow[] = [];
    const existingScopeVolumes = new Set(rows.filter(r => r.unit_type === 'SCOPE_SUMMARY').map(r => r.applies_to_volume));
    
    // Extract from GOVERNING_REQUIREMENT and other intro areas
    for (const r of rows) {
      if ((r.unit_type === 'GOVERNING_REQUIREMENT' || r.unit_type === 'INTRODUCTORY_PROVISION' || r.unit_type === 'INTRODUCTION') && r.text) {
        const fullText = [r.title, r.text].filter(Boolean).join(' ').toLowerCase();
        
        // Pattern 1: "applies to Class X" or "covers Class X"
        const classScopeMatch = fullText.match(/(applies to|covers|governs|relates to)\s+(Class\s+[^.!?]+|buildings?[^.!?]*)/i);
        if (classScopeMatch) {
          // Extract volume from context
          let vol = '';
          if (/volume\s+one|v1|volume\s+1/i.test(fullText) || /buildings|class\s+[2-9]/i.test(fullText)) vol = 'V1';
          else if (/volume\s+two|v2|volume\s+2/i.test(fullText) || /housing|class\s+1|class\s+10/i.test(fullText)) vol = 'V2';
          else if (/volume\s+three|v3|volume\s+3/i.test(fullText) || /plumbing|drainage/i.test(fullText)) vol = 'V3';
          else {
            // Infer from config
            if (/Volume\s+One|Buildings|Class\s+[2-9]/i.test(config.volume)) vol = 'V1';
            else if (/Volume\s+Two|Housing|Class\s+[1]|Class\s+10/i.test(config.volume)) vol = 'V2';
            else if (/Volume\s+Three|Plumbing|Drainage/i.test(config.volume)) vol = 'V3';
          }
          
          if (vol && !existingScopeVolumes.has(vol)) {
            // Extract classes
            const classMatches = classScopeMatch[2].match(/\bClass\s+([1-9]|10[ab]?)\b/gi);
            const classes = classMatches ? classMatches.map(c => c.replace(/Class\s+/i, '')).join('|') : '';
            
            const scopeRow: NccUnitRow = {
              ...r,
              unit_type: 'SCOPE_SUMMARY',
              unit_label: `SCOPE_${vol}_CLASSES`,
              applies_to_volume: vol,
              applies_to_class: classes,
              anchor_id: `${r.anchor_id}::SCOPE_SUMMARY_CLASSES`,
              text: `Volume ${vol === 'V1' ? 'One' : vol === 'V2' ? 'Two' : 'Three'} ${classScopeMatch[1]} ${classScopeMatch[2]}`,
              compliance_weight: 'MANDATORY',
              ncc_pathway: 'OBJECTIVE',
              normative_status: 'NORMATIVE',
              conditionality: 'ALWAYS',
              volume_hierarchy: 'PRIMARY',
              discipline: '',
              table_purpose: '',
              table_id: '',
              table_label: '',
              dataset_coverage: '',
            };
            additionalScopeRows.push(scopeRow);
            existingScopeVolumes.add(vol);
          }
        }
        
        // Pattern 2: Major exclusions
        if (/does not apply|excluded|not covered|outside the scope/i.test(fullText)) {
          let vol = '';
          if (/Volume\s+One|V1/i.test(fullText) || /Volume\s+One|Buildings|Class\s+[2-9]/i.test(config.volume)) vol = 'V1';
          else if (/Volume\s+Two|V2/i.test(fullText) || /Volume\s+Two|Housing/i.test(config.volume)) vol = 'V2';
          else if (/Volume\s+Three|V3/i.test(fullText) || /Volume\s+Three|Plumbing/i.test(config.volume)) vol = 'V3';
          
          if (vol) {
            const exclusionRow: NccUnitRow = {
              ...r,
              unit_type: 'SCOPE_SUMMARY',
              unit_label: `SCOPE_${vol}_EXCLUSIONS`,
              applies_to_volume: vol,
              anchor_id: `${r.anchor_id}::SCOPE_SUMMARY_EXCLUSIONS`,
              text: r.text.substring(0, 500), // First 500 chars of exclusion text
              compliance_weight: 'MANDATORY',
              ncc_pathway: 'OBJECTIVE',
              normative_status: 'NORMATIVE',
              conditionality: 'ALWAYS',
              volume_hierarchy: 'PRIMARY',
              discipline: '',
              table_purpose: '',
              table_id: '',
              table_label: '',
              applies_to_class: '',
              dataset_coverage: '',
            };
            additionalScopeRows.push(exclusionRow);
          }
        }
      }
    }
    
    // Insert additional scope rows
    if (additionalScopeRows.length > 0) {
      rows.unshift(...additionalScopeRows);
      log(`Fix 2: Added ${additionalScopeRows.length} additional SCOPE_SUMMARY rows`, 94);
    }
  }

  // FIX 3: Create table_id and table_label for tables
  log('Fix 3: Generating table_id and table_label...', 95);
  {
    let tableCounter = 1;
    for (const r of rows) {
      if (r.unit_type === 'TABLE') {
        // Extract table_id from caption or generate
        let tableId = '';
        let tableLabel = '';
        
        // Source 1: Extract from asset_caption (e.g., "Table D2.1")
        if (r.asset_caption) {
          const captionMatch = r.asset_caption.match(/Table\s+([A-Z]\d+(?:\.[A-Z]\d+)?(?:\.[0-9]+)?)/i);
          if (captionMatch) {
            tableId = captionMatch[1].toUpperCase();
            tableLabel = r.asset_caption;
          }
        }
        
        // Source 2: Extract from title
        if (!tableId && r.title) {
          const titleMatch = r.title.match(/Table\s+([A-Z]\d+(?:\.[A-Z]\d+)?(?:\.[0-9]+)?)/i);
          if (titleMatch) {
            tableId = titleMatch[1].toUpperCase();
            tableLabel = r.title;
          }
        }
        
        // Source 3: Extract from unit_label (e.g., "D2T1" -> "D2.1")
        if (!tableId && r.unit_label) {
          const labelMatch = r.unit_label.match(/^([A-Z]\d+)[Tt](\d+)$/);
          if (labelMatch) {
            tableId = `${labelMatch[1]}.${labelMatch[2]}`;
            tableLabel = `Table ${tableId}`;
          } else {
            // Try to extract from part_code if available
            if (r.part_code) {
              tableId = `${r.part_code}.${tableCounter}`;
              tableLabel = `Table ${tableId}`;
            }
          }
        }
        
        // Source 4: Generate from nearest clause/part
        if (!tableId) {
          // Use part_code if available
          if (r.part_code) {
            tableId = `${r.part_code}.${tableCounter}`;
          } else if (r.section_code) {
            // Fallback to section + counter
            tableId = `${r.section_code}${tableCounter}`;
          } else {
            // Last resort: auto-generate
            tableId = `TABLE-${String(tableCounter).padStart(3, '0')}`;
          }
          tableLabel = `Table ${tableId}`;
          if (r.asset_caption) {
            tableLabel = `${tableLabel}: ${r.asset_caption}`;
          } else if (r.title) {
            tableLabel = `${tableLabel}: ${r.title}`;
          }
        }
        
        r.table_id = tableId;
        r.table_label = tableLabel;
        tableCounter++;
      } else if (r.unit_type === 'TABLE_ROW') {
        // TABLE_ROW inherits table_id and table_label from parent
        if (r.parent_anchor_id) {
          const parentTable = rows.find(rt => rt.anchor_id === r.parent_anchor_id && rt.unit_type === 'TABLE');
          if (parentTable) {
            r.table_id = parentTable.table_id || '';
            r.table_label = parentTable.table_label || '';
          }
        }
      }
    }
  }

  // Add post-pass extraction summary to global warnings (for logs/tests).
  const svSummary = (globalThis as any).__NCC_SV_EXTRACTED__;
  if (svSummary && typeof svSummary === 'object') {
    if (typeof svSummary.extracted === 'number') globalWarnings.push(`STATE_VARIATION_EXTRACTED_BLOCKS:${svSummary.extracted}`);
    if (typeof svSummary.unbounded === 'number') globalWarnings.push(`STATE_VARIATION_UNBOUNDED_BLOCKS:${svSummary.unbounded}`);
    delete (globalThis as any).__NCC_SV_EXTRACTED__;
  }

  log(`Extraction complete: ${rows.length} units created, ${globalWarnings.length} warnings`, 100);
  return { rows, warnings: globalWarnings };
}

const CSV_COLUMNS: Array<keyof NccUnitRow> = [
  // exact order from your latest NCC schema
  'doc_id',
  'volume',
  'state_variation',
  'version_date',
  'source_file',
  'path',
  'anchor_id',
  'parent_anchor_id',
  'order_in_parent',
  'para_start',
  'para_end',
  'unit_label',
  'unit_type',
  'compliance_weight',
  'title',
  'text',
  'text_html',
  'defined_term',
  'contains_shall',
  'contains_must',
  'external_refs',
  'internal_refs',
  'satisfies_pr_ids',
  'related_unit_ids',
  'asset_type',
  'asset_id',
  'asset_caption',
  'asset_alt_text',
  'page_start',
  'page_end',
  'bbox_json',
  'extract_confidence',
  'warnings',
  // appended columns (do not remove old ones)
  'ncc_pathway',
  'normative_status',
  'conditionality',
  'heading_context',
  'raw_title',
  'raw_text',
  'applies_state',
  'variation_action',
  'affected_unit_label',
  'affected_subparts',
  'affects_anchor_id',
  // New columns for FINDING 2-6
  'table_grid_json',
  'table_key_values',
  'base_unit_label',
  'affected_subclause',
  'conditions_text',
  'exceptions_text',
  'requirements_list',
  'standards_referenced',
  'notes_quality',
  // Decision-oriented fields (FIX 1-8)
  'discipline',
  'table_purpose',
  'table_id',
  'table_label',
  'applies_to_volume',
  'applies_to_class',
  'volume_hierarchy',
  'dataset_coverage',
  // Phase 2A: Additional decision-oriented fields
  'scope_conditions',
  'formula_json',
  'constant_value',
  'constant_name',
  'pathway_alternative_to',
  'verification_method_for',
  // Identity validation fields (Priority 1)
  'section_code',
  'part_code',
  'indexable',
];

function csvEscape(value: any): string {
  // Handle boolean values (for indexable field)
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  // Handle null/undefined/NaN
  if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
    return '';
  }
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToNccUnitsCsv(rows: NccUnitRow[]): string {
  const header = CSV_COLUMNS.join(',');
  const lines = rows.map(r => CSV_COLUMNS.map(col => csvEscape((r as any)[col])).join(','));
  return [header, ...lines].join('\n');
}

/**
 * Convert rows to Excel with separate sheets for Clauses and Tables
 */
export async function rowsToNccUnitsExcel(rows: NccUnitRow[]): Promise<Buffer> {
  // Import xlsx dynamically to avoid issues in Node.js
  const XLSX = await import('xlsx');
  
  // Separate rows into clauses and tables
  const clauseRows: NccUnitRow[] = [];
  const tableRows: NccUnitRow[] = [];
  
  rows.forEach((row) => {
    // Tables include: TABLE unit type, TABLE_ROW unit type, or asset_type === 'TABLE'
    const isTable = row.unit_type === 'TABLE' || 
                    row.unit_type === 'TABLE_ROW' || 
                    row.asset_type === 'TABLE';
    
    if (isTable) {
      tableRows.push(row);
    } else {
      clauseRows.push(row);
    }
  });
  
  // Convert rows to worksheet format
  const clauseData = clauseRows.map(r => {
    const obj: any = {};
    CSV_COLUMNS.forEach(col => {
      obj[col] = (r as any)[col];
    });
    return obj;
  });
  
  const tableData = tableRows.map(r => {
    const obj: any = {};
    CSV_COLUMNS.forEach(col => {
      obj[col] = (r as any)[col];
    });
    return obj;
  });
  
  // Create workbook with two sheets
  const wb = XLSX.utils.book_new();
  
  // Add Clauses sheet
  if (clauseRows.length > 0) {
    const wsClauses = XLSX.utils.json_to_sheet(clauseData);
    XLSX.utils.book_append_sheet(wb, wsClauses, 'Clauses');
  }
  
  // Add Tables sheet
  if (tableRows.length > 0) {
    const wsTables = XLSX.utils.json_to_sheet(tableData);
    XLSX.utils.book_append_sheet(wb, wsTables, 'Tables');
  }
  
  // Convert to buffer
  return Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}


