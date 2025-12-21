/**
 * Type definitions for the Word Processor application
 */

export interface Clause {
  id: string;
  clauseNumber: string;
  text: string;
  paragraphIndex: number;
  markedBy: "auto" | "manual";
  notes?: string[];        // Array of NOTE texts attached to this clause
  exceptions?: string[];   // Array of EXCEPTION texts attached to this clause
  warnings?: string[];     // Array of WARNING/CAUTION texts attached to this clause
  jurisdiction?: string[]; // Array of jurisdiction-specific texts (e.g., "New Zealand only")
}

export interface DocumentData {
  html_raw: string;
  html_clean: string;
  text_raw: string;
  text_clean: string;
  paragraphs_raw: string[];
  paragraphs_clean: string[];
}

export interface UploadResponse {
  success: boolean;
  data?: DocumentData;
  error?: string;
}

export interface ExtractedTable {
  id: string;
  title: string;
  paragraphIndex: number; // -1 if unknown
  rows: number;
  cols: number;
  notes: string;
  lteText: string; // Full LTE_TABLE block as single string
}

