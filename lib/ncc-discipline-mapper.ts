/**
 * Utility to map NCC part codes to disciplines from ncc_answer_coverage_2022.yaml
 * Used for RAG app clause searching
 */

import * as yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

interface TopicRoute {
  section_code?: string;
  part_codes?: string[];
  disciplines?: string[];
}

interface Topic {
  topic_id: string;
  route?: TopicRoute;
}

interface Volume {
  volume: string;
  topics?: Topic[];
}

interface NCCAnswerCoverage {
  ncc_answer_coverage_map: {
    volumes?: Volume[];
  };
}

// Cache for the mappings per volume to avoid re-parsing
const volumeMappingsCache: Map<string, Map<string, string[]>> = new Map();

/**
 * Parse YAML file and create mapping of part_code -> disciplines[] for a specific volume
 * Returns a Map where key is part_code (e.g., "D1", "D2") and value is array of disciplines
 * @param volume - The volume to load mappings for (e.g., "Vol1", "Vol2", "Vol3")
 */
export function loadDisciplineMapping(volume: string): Map<string, string[]> {
  // Normalize volume format (Vol1, Vol2, Vol3)
  const normalizedVolume = volume.replace(/^Vol/i, 'Vol');
  if (!normalizedVolume.match(/^Vol[123]$/i)) {
    console.warn(`[Discipline Mapper] Invalid volume format: ${volume}, using as-is`);
  }
  
  // Check cache first
  if (volumeMappingsCache.has(normalizedVolume)) {
    return volumeMappingsCache.get(normalizedVolume)!;
  }

  const map = new Map<string, string[]>();

  try {
    // Load volume-specific YAML file (e.g., ncc_answer_coverage_2022_vol1.yaml)
    const yamlFileName = `ncc_answer_coverage_2022_${normalizedVolume.toLowerCase()}.yaml`;
    const yamlPath = path.join(process.cwd(), yamlFileName);
    console.log(`[Discipline Mapper] Attempting to load YAML from: ${yamlPath}`);
    console.log(`[Discipline Mapper] Current working directory: ${process.cwd()}`);
    
    if (!fs.existsSync(yamlPath)) {
      console.error(`[Discipline Mapper] ERROR: YAML file not found at: ${yamlPath}`);
      // Try to list files in cwd to debug
      try {
        const files = fs.readdirSync(process.cwd());
        const yamlFiles = files.filter(f => f.includes('yaml') || f.includes('yml'));
        console.log(`[Discipline Mapper] YAML files in cwd:`, yamlFiles);
      } catch (e) {
        console.error(`[Discipline Mapper] Could not list directory:`, e);
      }
      volumeMappingsCache.set(normalizedVolume, map);
      return map;
    }
    
    console.log(`[Discipline Mapper] YAML file found, loading...`);
    
    const fileContents = fs.readFileSync(yamlPath, 'utf8');
    console.log(`[Discipline Mapper] YAML file loaded successfully, ${fileContents.length} characters`);
    
    if (fileContents.length === 0) {
      console.error(`[Discipline Mapper] ERROR: YAML file is empty! Path: ${yamlPath}`);
      console.error(`[Discipline Mapper] File exists: ${fs.existsSync(yamlPath)}`);
      const stats = fs.statSync(yamlPath);
      console.error(`[Discipline Mapper] File stats: size=${stats.size} bytes, modified=${stats.mtime}`);
      volumeMappingsCache.set(normalizedVolume, map);
      return map;
    }
    
    const data = yaml.load(fileContents) as NCCAnswerCoverage;
    
    if (!data || !data.ncc_answer_coverage_map) {
      console.error('[Discipline Mapper] ERROR: Invalid YAML structure - missing ncc_answer_coverage_map');
      return map;
    }
    
    if (!data.ncc_answer_coverage_map.volumes) {
      console.error('[Discipline Mapper] ERROR: No volumes found in YAML');
      return map;
    }
    
    // Each volume-specific file should contain exactly one volume
    if (!data.ncc_answer_coverage_map.volumes || data.ncc_answer_coverage_map.volumes.length === 0) {
      console.error('[Discipline Mapper] ERROR: No volumes found in YAML');
      volumeMappingsCache.set(normalizedVolume, map);
      return map;
    }

    // Get the first (and should be only) volume from the file
    const targetVolume = data.ncc_answer_coverage_map.volumes[0];
    
    // Verify it matches the requested volume
    if (targetVolume.volume !== normalizedVolume && targetVolume.volume !== volume) {
      console.warn(`[Discipline Mapper] WARNING: File contains volume "${targetVolume.volume}" but requested "${normalizedVolume}"`);
    }
    
    console.log(`[Discipline Mapper] Loading mappings for volume: ${targetVolume.volume}`);
    
    if (targetVolume.topics) {
      console.log(`[Discipline Mapper] Found ${targetVolume.topics.length} topics for ${targetVolume.volume}`);
      
      for (const topic of targetVolume.topics) {
        if (topic.route?.disciplines) {
          const disciplines = topic.route.disciplines;
          
          // If part_codes are specified, map each part code to disciplines
          if (topic.route.part_codes && topic.route.part_codes.length > 0) {
            for (const partCode of topic.route.part_codes) {
              // If part code already exists, merge disciplines (avoid duplicates)
              const existing = map.get(partCode) || [];
              const merged = [...new Set([...existing, ...disciplines])];
              map.set(partCode, merged);
            }
          }
          // If only section_code is specified (no part_codes), map section_code to disciplines
          // This allows section-level mapping when part codes aren't specified
          else if (topic.route.section_code) {
            const sectionCode = topic.route.section_code;
            const existing = map.get(sectionCode) || [];
            const merged = [...new Set([...existing, ...disciplines])];
            map.set(sectionCode, merged);
          }
        }
      }
    }

    console.log(`[Discipline Mapper] Loaded ${map.size} part code/section mappings for ${normalizedVolume}`);
    console.log(`[Discipline Mapper] Sample mappings:`, Array.from(map.entries()).slice(0, 5));
    
    // Cache the mapping for this volume
    volumeMappingsCache.set(normalizedVolume, map);
    return map;
  } catch (error: any) {
    console.error('[Discipline Mapper] Error loading YAML:', error.message);
    console.error('[Discipline Mapper] Error stack:', error.stack);
    return map; // Return empty map on error
  }
}

/**
 * Extract part code from clause reference
 * Examples:
 *   "A5G1" -> "G1"
 *   "D2D1" -> "D1"
 *   "H2V1a" -> "V1"
 *   "P2.1" -> "P2"
 *   "table H2V1a" -> "V1"
 */
export function extractPartCode(clauseRef: string): string {
  if (!clauseRef) return '';
  
  // Remove "table " prefix if present
  const cleanRef = clauseRef.replace(/^table\s+/i, '').trim();
  
  // Pattern 1: Letter + Number + Letter + Number (e.g., A5G1, D2D1, H2V1)
  // Extract the last letter+number part (the part code)
  // For "A5G1" -> extract "G1"
  // For "D2D1" -> extract "D1"
  // For "H2V1a" -> extract "V1a"
  const pattern1 = /^[A-Z]\d+([A-Z]\d+[a-z]?)$/;
  const match1 = cleanRef.match(pattern1);
  if (match1) {
    return match1[1]; // Return part code like "G1", "D1", "V1a"
  }
  
  // Pattern 2: Letter + Number + Letter (e.g., A5G, D2D)
  // Extract the last letter
  const pattern2 = /([A-Z]\d+)([A-Z])$/;
  const match2 = cleanRef.match(pattern2);
  if (match2) {
    return match2[2]; // Return just the letter like "G", "D"
  }
  
  // Pattern 3: Letter + Number (e.g., P2, V1)
  const pattern3 = /^([A-Z]\d+)$/;
  const match3 = cleanRef.match(pattern3);
  if (match3) {
    return match3[1]; // Return full like "P2", "V1"
  }
  
  // Pattern 4: Letter + Number + Dot + Number (e.g., P2.1)
  // Return the letter + first number
  const pattern4 = /^([A-Z]\d+)\./;
  const match4 = cleanRef.match(pattern4);
  if (match4) {
    return match4[1]; // Return "P2"
  }
  
  return '';
}

/**
 * Get discipline(s) for a clause reference
 * Returns comma-separated string of disciplines, or empty string if not found
 * 
 * Tries multiple lookup strategies:
 * 1. Extract part code (e.g., "D1" from "D2D1") and look it up
 * 2. Extract section code (e.g., "D2" from "D2D1") and look it up
 * 3. Extract section letter (e.g., "D" from "D2D1") and look it up
 * 
 * @param clauseRef - The clause reference (e.g., "D2D1", "H4D5")
 * @param volume - The volume being processed (e.g., "Vol1", "Vol2", "Vol3")
 */
export function getDisciplineForClause(clauseRef: string, volume: string): string {
  if (!clauseRef) return '';
  
  // Remove "table " prefix if present
  const cleanRef = clauseRef.replace(/^table\s+/i, '').trim();
  
  const mapping = loadDisciplineMapping(volume);
  
  // Strategy 1: Try part code lookup (e.g., "D1" from "D2D1")
  const partCode = extractPartCode(cleanRef);
  if (partCode) {
    const disciplines = mapping.get(partCode);
    if (disciplines && disciplines.length > 0) {
      // Log first few successful lookups for debugging
      if (mapping.size > 0 && Math.random() < 0.05) {
        console.log(`[Discipline Mapper] ✓ Found: "${cleanRef}" -> partCode "${partCode}" -> "${disciplines.join(', ')}"`);
      }
      return disciplines.join(', ');
    } else {
      // Log when part code is extracted but not found in mapping
      if (mapping.size > 0 && Math.random() < 0.05) {
        console.log(`[Discipline Mapper] ✗ Part code "${partCode}" (from "${cleanRef}") not in mapping. Available keys: ${Array.from(mapping.keys()).slice(0, 10).join(', ')}`);
      }
    }
  }
  
  // Strategy 2: Try section letter lookup (e.g., "D" from "D2D1", "A" from "A5G1")
  // YAML uses section codes like "D", "C", "E", "J" (single letters), not "D2", "A5"
  const sectionLetterMatch = cleanRef.match(/^([A-Z])/);
  if (sectionLetterMatch) {
    const sectionLetter = sectionLetterMatch[1];
    const disciplines = mapping.get(sectionLetter);
    if (disciplines && disciplines.length > 0) {
      if (Math.random() < 0.01) {
        console.log(`[Discipline Mapper] Found discipline via section letter: "${cleanRef}" -> section "${sectionLetter}" -> "${disciplines.join(', ')}"`);
      }
      return disciplines.join(', ');
    }
  }
  
  // Strategy 3: Try section code lookup (e.g., "D2" from "D2D1", "A5" from "A5G1")
  // This is a fallback in case some topics use full section codes
  const sectionCodeMatch = cleanRef.match(/^([A-Z]\d+)/);
  if (sectionCodeMatch) {
    const sectionCode = sectionCodeMatch[1];
    const disciplines = mapping.get(sectionCode);
    if (disciplines && disciplines.length > 0) {
      if (Math.random() < 0.01) {
        console.log(`[Discipline Mapper] Found discipline via section code: "${cleanRef}" -> section "${sectionCode}" -> "${disciplines.join(', ')}"`);
      }
      return disciplines.join(', ');
    }
  }
  
  // Debug logging (only occasionally to avoid spam)
  if (cleanRef && !cleanRef.startsWith('table ') && Math.random() < 0.01) {
    console.log(`[Discipline Mapper] No discipline found for: "${cleanRef}" (tried partCode: "${partCode}", mapping size: ${mapping.size})`);
    // Show available keys for debugging
    const sampleKeys = Array.from(mapping.keys()).slice(0, 10);
    console.log(`[Discipline Mapper] Sample mapping keys:`, sampleKeys);
  }
  
  return '';
}

/**
 * Get all part codes that map to a specific discipline
 */
export function getPartCodesForDiscipline(discipline: string): string[] {
  const mapping = loadDisciplineMapping();
  const partCodes: string[] = [];
  
  for (const [partCode, disciplines] of mapping.entries()) {
    if (disciplines.includes(discipline)) {
      partCodes.push(partCode);
    }
  }
  
  return partCodes;
}

