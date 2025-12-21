/**
 * Retrieval Filters (Priority 3)
 * 
 * Unit type filtering based on query type and coverage gating.
 * Enforces scope authority and prevents out-of-scope answers.
 */

import { NccUnitType } from './ncc-units';
import { QueryType } from './query-router';

export interface CoverageCheck {
  isValid: boolean;
  refuse: boolean;
  reason: string;
}

export interface FilterResult {
  allowedTypes: NccUnitType[];
  excludedTypes: NccUnitType[];
  coverageCheck: CoverageCheck;
}

/**
 * Get allowed unit types for a query type
 */
export function getAllowedUnitTypes(queryType: QueryType): NccUnitType[] {
  switch (queryType) {
    case 'SCOPE':
      return ['SCOPE_SUMMARY', 'GOVERNANCE_RULE', 'DEFINITION'];
    
    case 'DEFINITION':
      return ['DEFINITION', 'GOVERNANCE_RULE', 'INTRODUCTORY_PROVISION'];
    
    case 'TABLE_NUMERIC':
      return ['TABLE_ROW', 'TABLE', 'SPECIFICATION_CLAUSE'];
    
    case 'TECHNICAL':
      // FIXED: Restricted to relevant types, excludes noise
      return [
        'PERFORMANCE_REQUIREMENT',
        'DTS_PROVISION',
        'SPECIFICATION_CLAUSE',
        'TABLE_ROW',
        'CONDITIONAL_RULE',
        'DISCIPLINE_RULE',
        'GOVERNANCE_RULE', // Small boost for pathway questions
      ];
    
    default:
      return [];
  }
}

/**
 * Get excluded unit types for a query type
 */
export function getExcludedUnitTypes(queryType: QueryType): NccUnitType[] {
  switch (queryType) {
    case 'SCOPE':
      return [
        'DTS_PROVISION',
        'PERFORMANCE_REQUIREMENT',
        'SPECIFICATION_CLAUSE',
        'TABLE_ROW',
        'TABLE',
      ];
    
    case 'DEFINITION':
      return ['TABLE_ROW', 'TABLE'];
    
    case 'TABLE_NUMERIC':
      return []; // No exclusions for table queries
    
    case 'TECHNICAL':
      // FIXED: Exclude noise types
      return [
        'SCOPE_SUMMARY',
        'INTRODUCTORY_PROVISION',
        'HEADING',
      ];
    
    default:
      return [];
  }
}

/**
 * Check dataset coverage before retrieval
 * Returns coverage check result with refusal reason if needed
 */
export function checkCoverage(
  question: string,
  datasetCoverage: { parts?: string[]; missing_parts?: string[]; volume?: string } | null
): CoverageCheck {
  if (!datasetCoverage) {
    return {
      isValid: true,
      refuse: false,
      reason: '',
    };
  }

  // Extract requested volume from question
  const volumeMatch = question.match(/\bVolume\s+(One|Two|Three)\b/i);
  if (volumeMatch) {
    const requestedVol = volumeMatch[1].toLowerCase();
    const volCode = requestedVol === 'one' ? 'V1' : requestedVol === 'two' ? 'V2' : 'V3';
    const datasetVol = datasetCoverage.volume;
    
    if (datasetVol && datasetVol !== volCode) {
      return {
        isValid: false,
        refuse: true,
        reason: `Question asks about ${volCode} but dataset contains ${datasetVol}`,
      };
    }
  }

  // Extract requested part from question
  const partMatch = question.match(/\bPart\s+([A-J]\d+)\b/i);
  if (partMatch) {
    const requestedPart = partMatch[1].toUpperCase();
    const parts = datasetCoverage.parts || [];
    const missingParts = datasetCoverage.missing_parts || [];
    
    if (missingParts.includes(requestedPart)) {
      return {
        isValid: false,
        refuse: true,
        reason: `Question asks about Part ${requestedPart} which is not in dataset. Missing parts: ${missingParts.join(', ')}`,
      };
    }
    
    if (parts.length > 0 && !parts.includes(requestedPart)) {
      return {
        isValid: false,
        refuse: true,
        reason: `Question asks about Part ${requestedPart} which is not in dataset. Available parts: ${parts.join(', ')}`,
      };
    }
  }

  return {
    isValid: true,
    refuse: false,
    reason: '',
  };
}

/**
 * Check if results should trigger early refusal
 */
export function shouldRefuse(
  queryType: QueryType,
  results: any[],
  coverageCheck: CoverageCheck
): { refuse: boolean; message: string } {
  // Coverage refusal (before retrieval)
  if (coverageCheck.refuse) {
    return {
      refuse: true,
      message: `I cannot answer this question because: ${coverageCheck.reason}. This dataset contains: ${JSON.stringify(coverageCheck)}. Please rephrase your question to match the dataset scope, or use a dataset that includes the requested volume/part.`,
    };
  }

  // Scope authority refusal (after filtering)
  if (queryType === 'SCOPE' && results.length === 0) {
    return {
      refuse: true,
      message: 'Scope summary is missing for this volume/dataset. Cannot answer scope questions without scope metadata.',
    };
  }

  return {
    refuse: false,
    message: '',
  };
}

/**
 * Get filter configuration for a query type
 */
export function getFilterConfig(queryType: QueryType): FilterResult {
  return {
    allowedTypes: getAllowedUnitTypes(queryType),
    excludedTypes: getExcludedUnitTypes(queryType),
    coverageCheck: {
      isValid: true,
      refuse: false,
      reason: '',
    },
  };
}

