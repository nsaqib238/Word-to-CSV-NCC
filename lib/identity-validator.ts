/**
 * Identity Validator (Priority 1)
 * 
 * Derives and validates identity fields (section_code, part_code, applies_to_volume)
 * for all NCC unit rows using a strict fallback chain.
 */

import { NccUnitRow, NccUnitType } from './ncc-units';

export interface IdentityError {
  row_id: string;
  anchor_id: string;
  unit_label: string;
  path: string;
  missing_fields: string[];
  reason: string;
}

export interface ValidationStats {
  totalRows: number;
  rowsWithCompleteIdentity: number;
  rowsMarkedNonIndexable: number;
  errorsByReason: Record<string, number>;
}

export interface ValidationResult {
  validatedRows: NccUnitRow[];
  errors: IdentityError[];
  stats: ValidationStats;
}

/**
 * Extract section code from path string
 * Pattern: "Section H" → "H"
 */
function extractSectionCode(path: string): string | null {
  const match = path.match(/\bSection\s+([A-J])\b/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Extract part code from path string
 * Pattern: "Part H1" → "H1"
 */
function extractPartCode(path: string): string | null {
  const match = path.match(/\bPart\s+([A-J]\d+(?:\.\d+)?)\b/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Extract section and part code from unit_label
 * Pattern: "J7D4" → section_code="J", part_code="J7"
 * Pattern: "D2D1" → section_code="D", part_code="D2"
 */
function extractFromUnitLabel(unitLabel: string): { section_code: string | null; part_code: string | null } {
  if (!unitLabel) return { section_code: null, part_code: null };
  
  // Pattern: Letter + Number + Letter + Number (e.g., J7D4, D2D1, C3P2)
  const match = unitLabel.match(/^([A-J])(\d+)([A-Z]\d+)/);
  if (match) {
    const section = match[1].toUpperCase();
    const part = `${section}${match[2]}`;
    return { section_code: section, part_code: part };
  }
  
  // Fallback: Just Part code (e.g., J7, D2)
  const partMatch = unitLabel.match(/^([A-J]\d+)/);
  if (partMatch) {
    const part = partMatch[1].toUpperCase();
    const section = part[0];
    return { section_code: section, part_code: part };
  }
  
  return { section_code: null, part_code: null };
}

/**
 * Extract volume code from path string
 * Pattern: "Volume Two" → "V2"
 */
function extractVolumeCode(path: string): string | null {
  const match = path.match(/\bVolume\s+(One|Two|Three)\b/i);
  if (!match) return null;
  const vol = match[1].toLowerCase();
  if (vol === 'one') return 'V1';
  if (vol === 'two') return 'V2';
  if (vol === 'three') return 'V3';
  return null;
}

/**
 * Validate volume code format
 */
function isValidVolumeCode(vol: string): boolean {
  return vol === 'V1' || vol === 'V2' || vol === 'V3';
}

/**
 * Validate section code format (single letter A-J)
 */
function isValidSectionCode(code: string): boolean {
  return /^[A-J]$/.test(code);
}

/**
 * Validate part code format (letter + number like "J7", "D2")
 */
function isValidPartCode(code: string): boolean {
  return /^[A-J]\d+(?:\.\d+)?$/.test(code);
}

/**
 * Find parent row by anchor_id
 */
function findParentRow(
  parentAnchorId: string,
  allRows: NccUnitRow[],
  anchorIdMap: Map<string, NccUnitRow>
): NccUnitRow | null {
  if (!parentAnchorId) return null;
  return anchorIdMap.get(parentAnchorId) || null;
}

/**
 * Walk up heading chain to find SECTION/PART heading
 */
function findParentHeading(
  row: NccUnitRow,
  allRows: NccUnitRow[],
  anchorIdMap: Map<string, NccUnitRow>
): NccUnitRow | null {
  let current: NccUnitRow | null = row;
  const visited = new Set<string>();
  
  while (current && current.parent_anchor_id) {
    if (visited.has(current.anchor_id)) break; // Prevent infinite loops
    visited.add(current.anchor_id);
    
    const parent = findParentRow(current.parent_anchor_id, allRows, anchorIdMap);
    if (!parent) break;
    
    // Check if parent is a SECTION or PART heading
    if (parent.unit_type === 'SECTION' || parent.unit_type === 'PART') {
      return parent;
    }
    
    current = parent;
  }
  
  return null;
}

/**
 * Derive identity for a single row using strict fallback chain
 */
function deriveIdentityForRow(
  row: NccUnitRow,
  allRows: NccUnitRow[],
  anchorIdMap: Map<string, NccUnitRow>,
  defaultVolume?: string
): {
  section_code: string;
  part_code: string;
  applies_to_volume: string;
  derivationMethod: string;
} {
  let section_code = '';
  let part_code = '';
  let applies_to_volume = '';
  let derivationMethod = 'none';

  // Step 1: Use explicit columns if already present
  if (row.section_code && isValidSectionCode(row.section_code)) {
    section_code = row.section_code;
    derivationMethod = 'explicit';
  }
  if (row.part_code && isValidPartCode(row.part_code)) {
    part_code = row.part_code;
    derivationMethod = 'explicit';
  }
  if (row.applies_to_volume && isValidVolumeCode(row.applies_to_volume)) {
    applies_to_volume = row.applies_to_volume;
    derivationMethod = 'explicit';
  }

  // If all fields are explicit, return early
  if (section_code && part_code && applies_to_volume) {
    return { section_code, part_code, applies_to_volume, derivationMethod: 'explicit' };
  }

  // Step 2: Parse path field if present
  if (row.path) {
    const pathSection = extractSectionCode(row.path);
    const pathPart = extractPartCode(row.path);
    const pathVolume = extractVolumeCode(row.path);

    if (pathSection && !section_code) {
      section_code = pathSection;
      derivationMethod = derivationMethod === 'explicit' ? 'mixed' : 'path';
    }
    if (pathPart && !part_code) {
      part_code = pathPart;
      derivationMethod = derivationMethod === 'explicit' ? 'mixed' : 'path';
    }
    if (pathVolume && !applies_to_volume) {
      applies_to_volume = pathVolume;
      derivationMethod = derivationMethod === 'explicit' ? 'mixed' : 'path';
    }
  }

  // Step 3: Inherit from nearest parent heading (if path missing/weak)
  if ((!section_code || !part_code) && row.parent_anchor_id) {
    const parentHeading = findParentHeading(row, allRows, anchorIdMap);
    if (parentHeading) {
      // Try to extract from parent's path or use parent's derived values
      if (parentHeading.path) {
        const parentSection = extractSectionCode(parentHeading.path);
        const parentPart = extractPartCode(parentHeading.path);
        
        if (parentSection && !section_code) {
          section_code = parentSection;
          derivationMethod = derivationMethod === 'explicit' || derivationMethod === 'path' ? 'mixed' : 'parent';
        }
        if (parentPart && !part_code) {
          part_code = parentPart;
          derivationMethod = derivationMethod === 'explicit' || derivationMethod === 'path' ? 'mixed' : 'parent';
        }
      }
      
      // Also check if parent has derived values
      if (parentHeading.section_code && !section_code) {
        section_code = parentHeading.section_code;
        derivationMethod = derivationMethod === 'explicit' || derivationMethod === 'path' ? 'mixed' : 'parent';
      }
      if (parentHeading.part_code && !part_code) {
        part_code = parentHeading.part_code;
        derivationMethod = derivationMethod === 'explicit' || derivationMethod === 'path' ? 'mixed' : 'parent';
      }
    }
  }

  // Step 4: Extract from unit_label (FIX B - fallback when path is empty)
  if ((!section_code || !part_code) && row.unit_label) {
    const labelExtracted = extractFromUnitLabel(row.unit_label);
    if (labelExtracted.section_code && !section_code) {
      section_code = labelExtracted.section_code;
      derivationMethod = derivationMethod === 'explicit' || derivationMethod === 'path' || derivationMethod === 'parent' ? 'mixed' : 'unit_label';
    }
    if (labelExtracted.part_code && !part_code) {
      part_code = labelExtracted.part_code;
      derivationMethod = derivationMethod === 'explicit' || derivationMethod === 'path' || derivationMethod === 'parent' ? 'mixed' : 'unit_label';
    }
  }

  // Step 5: Use volume field to populate applies_to_volume (FIX A)
  if (!applies_to_volume && row.volume) {
    // Check if volume field contains "Volume One/Two/Three" or "V1/V2/V3"
    const volMatch = row.volume.match(/Volume\s+(One|Two|Three)|(V[123])/i);
    if (volMatch) {
      if (volMatch[1]) {
        const vol = volMatch[1].toLowerCase();
        if (vol === 'one') applies_to_volume = 'V1';
        else if (vol === 'two') applies_to_volume = 'V2';
        else if (vol === 'three') applies_to_volume = 'V3';
      } else if (volMatch[2]) {
        applies_to_volume = volMatch[2].toUpperCase();
      }
      if (applies_to_volume && derivationMethod === 'none') {
        derivationMethod = 'volume_field';
      }
    }
  }

  // Step 6: Fallback to default volume from config
  if (!applies_to_volume && defaultVolume) {
    const volMatch = defaultVolume.match(/Volume\s+(One|Two|Three)/i);
    if (volMatch) {
      const vol = volMatch[1].toLowerCase();
      if (vol === 'one') applies_to_volume = 'V1';
      else if (vol === 'two') applies_to_volume = 'V2';
      else if (vol === 'three') applies_to_volume = 'V3';
      if (applies_to_volume && derivationMethod === 'none') {
        derivationMethod = 'default';
      }
    }
  }

  return { section_code, part_code, applies_to_volume, derivationMethod };
}

/**
 * Apply per-unit-type identity rules
 */
function applyUnitTypeRules(
  row: NccUnitRow,
  allRows: NccUnitRow[],
  anchorIdMap: Map<string, NccUnitRow>,
  derived: { section_code: string; part_code: string; applies_to_volume: string }
): { indexable: boolean; reason: string } {
  // TABLE_ROW units: Must inherit from parent TABLE
  if (row.unit_type === 'TABLE_ROW') {
    if (!row.parent_anchor_id) {
      return { indexable: false, reason: 'TABLE_ROW_missing_parent' };
    }
    
    const parent = findParentRow(row.parent_anchor_id, allRows, anchorIdMap);
    if (!parent || parent.unit_type !== 'TABLE') {
      return { indexable: false, reason: 'TABLE_ROW_parent_not_table' };
    }
    
    // Inherit from parent if not already derived
    if (!derived.section_code && parent.section_code) {
      derived.section_code = parent.section_code;
    }
    if (!derived.part_code && parent.part_code) {
      derived.part_code = parent.part_code;
    }
    if (!derived.applies_to_volume && parent.applies_to_volume) {
      derived.applies_to_volume = parent.applies_to_volume;
    }
  }

  // SCOPE_SUMMARY units: Must always have applies_to_volume
  if (row.unit_type === 'SCOPE_SUMMARY') {
    if (!derived.applies_to_volume) {
      return { indexable: false, reason: 'SCOPE_SUMMARY_missing_volume' };
    }
  }

  // Regular clause units: Should have part_code (can be empty for cross-part rules)
  // Should have applies_to_volume (can be empty for cross-volume rules)
  // These are warnings, not blockers

  return { indexable: true, reason: '' };
}

/**
 * Main validation function
 */
export function validateAndDeriveIdentity(
  rows: NccUnitRow[],
  defaultVolume?: string
): ValidationResult {
  const errors: IdentityError[] = [];
  const stats: ValidationStats = {
    totalRows: rows.length,
    rowsWithCompleteIdentity: 0,
    rowsMarkedNonIndexable: 0,
    errorsByReason: {},
  };

  // Create anchor_id map for fast lookups
  const anchorIdMap = new Map<string, NccUnitRow>();
  for (const row of rows) {
    anchorIdMap.set(row.anchor_id, row);
  }

  // First pass: Derive identity for all rows
  const validatedRows: NccUnitRow[] = rows.map((row) => {
    const derived = deriveIdentityForRow(row, rows, anchorIdMap, defaultVolume);
    
    // Ensure we use derived values or existing values, never undefined/null
    const section_code = derived.section_code || row.section_code || '';
    const part_code = derived.part_code || row.part_code || '';
    const applies_to_volume = derived.applies_to_volume || row.applies_to_volume || '';
    
    return {
      ...row,
      section_code,
      part_code,
      applies_to_volume,
      indexable: true, // Will be set in second pass
    };
  });

  // Second pass: Apply unit-type rules and validate
  const finalRows: NccUnitRow[] = validatedRows.map((row) => {
    const derived = {
      section_code: row.section_code,
      part_code: row.part_code,
      applies_to_volume: row.applies_to_volume,
    };

    const ruleResult = applyUnitTypeRules(row, validatedRows, anchorIdMap, derived);
    
    // Update derived values if rule modified them
    row.section_code = derived.section_code;
    row.part_code = derived.part_code;
    row.applies_to_volume = derived.applies_to_volume;
    row.indexable = ruleResult.indexable;

    // Check if identity is complete enough
    const hasVolume = !!row.applies_to_volume && isValidVolumeCode(row.applies_to_volume);
    const hasSection = !!row.section_code && isValidSectionCode(row.section_code);
    const hasPart = !!row.part_code && isValidPartCode(row.part_code);

    // FIXED: More lenient indexing rules
    // For most units, at least volume OR (section AND part) should be present
    // Path is optional (Fix C)
    if (!hasVolume && row.unit_type !== 'SCOPE_SUMMARY') {
      // If we have section and part, that's enough (path optional)
      if (hasSection && hasPart) {
        // Good enough - keep indexable
      } else if (!hasSection && !hasPart) {
        // No identity at all - mark non-indexable
        row.indexable = false;
        ruleResult.reason = ruleResult.reason || 'identity_incomplete_after_fallbacks';
      }
      // If we have volume but no section/part, that's okay for cross-part rules
    }

    if (row.indexable) {
      stats.rowsWithCompleteIdentity++;
    } else {
      stats.rowsMarkedNonIndexable++;
      const reason = ruleResult.reason || 'identity_incomplete_after_fallbacks';
      stats.errorsByReason[reason] = (stats.errorsByReason[reason] || 0) + 1;

      errors.push({
        row_id: row.anchor_id,
        anchor_id: row.anchor_id,
        unit_label: row.unit_label || '',
        path: row.path || '',
        missing_fields: [
          !hasVolume ? 'applies_to_volume' : '',
          !hasSection ? 'section_code' : '',
          !hasPart ? 'part_code' : '',
        ].filter(Boolean),
        reason,
      });
    }

    return row;
  });

  return {
    validatedRows: finalRows,
    errors,
    stats,
  };
}

