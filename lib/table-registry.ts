/**
 * Table Registry (Priority 4)
 * 
 * Table metadata registry and enrichment for TABLE_ROW units.
 * Provides table title, anchor clause, and purpose for retrieved table rows.
 */

import { NccUnitRow } from './ncc-units';

export interface TableMetadata {
  table_id?: string;
  asset_id?: string;
  anchor_id?: string;
  table_title: string;
  table_purpose: string;
  anchor_clause: string;
  applies_to_class?: string[];
  section_code?: string;
  part_code?: string;
  discipline?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface TableRegistry {
  tables: TableMetadata[];
}

export interface EnrichedTableRow extends NccUnitRow {
  enriched_table_title?: string;
  enriched_anchor_clause?: string;
  enriched_table_purpose?: string;
}

/**
 * Generate table key from row data if no stable key exists
 */
function generateTableKey(
  volume: string,
  path: string,
  tableIndex: number,
  firstRowHeader: string
): string {
  const signature = `${volume}|${path}|${tableIndex}|${firstRowHeader.substring(0, 50)}`;
  // Simple hash function (for production, use crypto.createHash)
  let hash = 0;
  for (let i = 0; i < signature.length; i++) {
    const char = signature.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `table_${Math.abs(hash)}`;
}

/**
 * Load table registry from JSON file
 */
export async function loadTableRegistry(registryPath?: string): Promise<TableRegistry> {
  // In production, load from data/table-registry.json
  // For now, return empty registry (to be populated)
  return {
    tables: [],
  };
}

/**
 * Find table metadata by primary key
 * Uses asset_id (preferred) or table_id (fallback)
 */
export function findTableByKey(
  row: NccUnitRow,
  registry: TableRegistry
): TableMetadata | null {
  // Preferred: asset_id
  if (row.asset_id) {
    const found = registry.tables.find(t => t.asset_id === row.asset_id);
    if (found) return found;
  }

  // Fallback: table_id (if exists in row)
  // Note: table_id is not in NccUnitRow schema, would need to be added if used
  // For now, we'll use asset_id only

  // If no stable key, generate one and check if registered
  if (row.unit_type === 'TABLE_ROW' && row.parent_anchor_id) {
    // Try to find parent table
    const parentTable = registry.tables.find(t => t.anchor_id === row.parent_anchor_id);
    if (parentTable) return parentTable;
  }

  return null;
}

/**
 * Enrich a TABLE_ROW with registry metadata
 */
export function enrichTableRow(
  row: NccUnitRow,
  registry: TableRegistry
): EnrichedTableRow {
  if (row.unit_type !== 'TABLE_ROW') {
    return row as EnrichedTableRow;
  }

  const metadata = findTableByKey(row, registry);
  if (!metadata) {
    // Graceful degradation: return row as-is if not in registry
    return row as EnrichedTableRow;
  }

  return {
    ...row,
    enriched_table_title: metadata.table_title,
    enriched_anchor_clause: metadata.anchor_clause,
    enriched_table_purpose: metadata.table_purpose || row.table_purpose,
  };
}

/**
 * Format evidence with table metadata
 */
export function formatTableEvidence(row: EnrichedTableRow): string {
  const parts: string[] = [];
  
  if (row.enriched_table_title) {
    parts.push(`[Table: ${row.enriched_table_title}]`);
  }
  
  if (row.enriched_anchor_clause) {
    parts.push(`(See ${row.enriched_anchor_clause})`);
  }
  
  if (row.enriched_table_purpose) {
    parts.push(`Purpose: ${row.enriched_table_purpose}`);
  }
  
  parts.push(`Row: ${row.text}`);
  
  return parts.join(' ');
}

