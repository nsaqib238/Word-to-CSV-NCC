/**
 * Query Router (Priority 2)
 * 
 * Deterministically classifies questions into query types before retrieval.
 * Returns query type with confidence and reasoning.
 */

export type QueryType = 'SCOPE' | 'DEFINITION' | 'TABLE_NUMERIC' | 'TECHNICAL';

export interface QueryClassification {
  query_type: QueryType;
  confidence: number;
  matched_rules: string[];
  reasoning: string;
}

/**
 * Classify a query into one of the query types
 */
export function classifyQuery(query: string): QueryClassification {
  const normalizedQuery = query.toLowerCase().trim();
  const matchedRules: string[] = [];
  let reasoning = '';

  // SCOPE Triggers
  const scopePattern = /\b(apply|applies|scope|covers|which classes|volume one apply|application of volume|does.*apply|applies to)\b/i;
  const scopeMatches = normalizedQuery.match(scopePattern);
  if (scopeMatches) {
    matchedRules.push('SCOPE: ' + scopeMatches[0]);
    reasoning = `Detected scope keywords: ${scopeMatches[0]}`;
    return {
      query_type: 'SCOPE',
      confidence: scopeMatches.length > 1 ? 0.9 : 0.8,
      matched_rules: matchedRules,
      reasoning,
    };
  }

  // DEFINITION Triggers (FIXED: require definition intent words)
  // Pattern: "define", "definition", "meaning", "term", "what does X mean"
  // Do NOT match generic "what is" unless paired with definition intent
  const definitionPattern = /\b(define|definition|meaning|term|what does.*mean|in ncc.*what does.*mean)\b/i;
  const definitionMatches = normalizedQuery.match(definitionPattern);
  if (definitionMatches) {
    matchedRules.push('DEFINITION: ' + definitionMatches[0]);
    reasoning = `Detected definition intent: ${definitionMatches[0]}`;
    return {
      query_type: 'DEFINITION',
      confidence: 0.85,
      matched_rules: matchedRules,
      reasoning,
    };
  }

  // Check for "what is" + definition context (e.g., "what is the definition of")
  const whatIsDefinitionPattern = /\bwhat is (the )?(definition|meaning) of\b/i;
  if (whatIsDefinitionPattern.test(normalizedQuery)) {
    matchedRules.push('DEFINITION: what is definition/meaning');
    reasoning = 'Detected "what is definition/meaning" pattern';
    return {
      query_type: 'DEFINITION',
      confidence: 0.8,
      matched_rules: matchedRules,
      reasoning,
    };
  }

  // TABLE_NUMERIC Triggers
  const tableNumericPattern = /\b(table|minimum|maximum|mm\b|m\b|kPa|L\/s|sizing|distance|threshold|row|column|\d+\s*(mm|m|kPa|L\/s))\b/i;
  const tableNumericMatches = normalizedQuery.match(tableNumericPattern);
  if (tableNumericMatches) {
    matchedRules.push('TABLE_NUMERIC: ' + tableNumericMatches[0]);
    reasoning = `Detected table/numeric keywords: ${tableNumericMatches[0]}`;
    return {
      query_type: 'TABLE_NUMERIC',
      confidence: 0.75,
      matched_rules: matchedRules,
      reasoning,
    };
  }

  // TECHNICAL (Default)
  reasoning = 'No specific query type patterns matched, defaulting to TECHNICAL';
  return {
    query_type: 'TECHNICAL',
    confidence: 0.5,
    matched_rules: ['TECHNICAL: default'],
    reasoning,
  };
}

