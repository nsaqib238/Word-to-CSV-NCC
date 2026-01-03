/**
 * Word Processor + Clause Highlighter
 *
 * Extracted from the original `pages/index.tsx` so it can live inside
 * the new Title Page -> Clauses tab without changing behavior.
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Button,
  Container,
  Grid,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  CircularProgress,
  FormControlLabel,
  Switch,
  Checkbox,
} from '@mui/material';
import {
  Upload as UploadIcon,
  FileDownload as ExportIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { DocumentData, Clause } from '@/types';
import { detectAllClauses } from '@/lib/clause-detector';
import { v4 as uuidv4 } from 'uuid';
import DocumentEditor from '@/components/DocumentEditor';

type ViewMode = 'clean' | 'editor';

export default function WordProcessor() {
  const [documentData, setDocumentData] = useState<DocumentData | null>(null);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('clean');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editedHtml, setEditedHtml] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [selectedClauseIds, setSelectedClauseIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const promptInProgressRef = useRef<boolean>(false);
  const lastClickTimeRef = useRef<number>(0);
  const lastClickParagraphIndexRef = useRef<number | null>(null);

  /**
   * Handle file upload
   */
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.docx') && !file.name.endsWith('.doc')) {
      setError('Please upload a .docx or .doc file');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-docx', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to upload file');
      }

      setDocumentData(result.data);

      // Auto-detect clauses from clean paragraphs
      const detectedClauses = detectAllClauses(result.data.paragraphs_clean);
      setClauses(detectedClauses);

      // Clear selection when new file is uploaded
      setSelectedClauseIds(new Set());

      // Set preview toggle based on file size (>5MB) or paragraph count (>1000)
      // OFF by default for large files to improve performance
      const fileSizeMB = file.size / (1024 * 1024);
      const paragraphCount = result.data.paragraphs_clean?.length || 0;
      const shouldDisablePreview = fileSizeMB > 5 || paragraphCount > 1000;
      setShowPreview(!shouldDisablePreview);
    } catch (err: any) {
      setError(err.message || 'Failed to process file');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Toggle clause highlight
   * Uses functional state updates to ensure we work with latest state
   */
  const toggleClauseHighlight = useCallback((paragraphIndex: number, elementText?: string) => {
    console.log('🔵 toggleClauseHighlight called:', { paragraphIndex, elementText: elementText?.substring(0, 100) });

    // Check if prompt is already in progress BEFORE doing anything
    if (promptInProgressRef.current) {
      console.log('⚠️ Prompt already in progress, skipping duplicate call');
      return;
    }

    // Use functional update to ensure we have the latest clauses state
    setClauses((currentClauses) => {
      console.log('📋 Current clauses count:', currentClauses.length);

      // Find clause(s) for this paragraph index
      const existingClauses = currentClauses.filter(c => c.paragraphIndex === paragraphIndex);
      console.log('🔍 Existing clauses for paragraph', paragraphIndex, ':', existingClauses.length, existingClauses.map(c => ({ id: c.id, clauseNumber: c.clauseNumber, markedBy: c.markedBy })));

      // If we have element text, try to match more precisely
      if (elementText && existingClauses.length > 0) {
        // Find the clause that best matches this element's text
        const matchingClause = existingClauses.find(c => {
          const clauseText = c.text.trim();
          const elemText = elementText.trim();
          // Exact match or element contains clause text
          return clauseText === elemText ||
            elemText.includes(clauseText.substring(0, Math.min(50, clauseText.length)));
        });

        if (matchingClause) {
          console.log('✅ Unmarking matching clause:', matchingClause.clauseNumber, matchingClause.id);
          const newClauses = currentClauses.filter(c => c.id !== matchingClause.id);
          console.log('📊 Clauses after unmark:', newClauses.length);
          // Unmark only the matching clause
          return newClauses;
        }
      }

      // If no precise match or multiple clauses, unmark all for this paragraph
      if (existingClauses.length > 0) {
        console.log('✅ Unmarking all clauses for paragraph', paragraphIndex, '(', existingClauses.length, 'clauses)');
        const newClauses = currentClauses.filter(c => c.paragraphIndex !== paragraphIndex);
        console.log('📊 Clauses after unmark:', newClauses.length);
        // Unmark all clauses for this paragraph
        return newClauses;
      } else {
        console.log('➕ No existing clauses, prompting for manual mark');

        // Double-check flag inside state setter (defense in depth)
        if (promptInProgressRef.current) {
          console.log('⚠️ Prompt already in progress (inside setter), skipping duplicate call');
          return currentClauses;
        }

        // Mark clause manually
        const paragraph = documentData?.paragraphs_clean[paragraphIndex] || '';

        // Set flag IMMEDIATELY and synchronously before prompt
        promptInProgressRef.current = true;
        console.log('🔒 Prompt flag set to true');

        // Show prompt synchronously
        const clauseNumber = prompt('Enter clause number:', '');

        // Clear flag after prompt is done
        promptInProgressRef.current = false;
        console.log('🔓 Prompt flag set to false');

        if (clauseNumber && clauseNumber.trim()) {
          const newClause: Clause = {
            id: uuidv4(),
            clauseNumber: clauseNumber.trim(),
            text: paragraph,
            paragraphIndex,
            markedBy: 'manual',
          };
          console.log('✅ Adding new manual clause:', newClause.clauseNumber, newClause.id);
          const newClauses = [...currentClauses, newClause];
          console.log('📊 Clauses after add:', newClauses.length);
          return newClauses;
        } else {
          console.log('❌ User cancelled prompt');
        }
      }

      // No change
      console.log('⚪ No change to clauses');
      return currentClauses;
    });
  }, [documentData]);

  /**
   * Handle editor content updates
   */
  const handleEditorUpdate = (html: string) => {
    setEditedHtml(html);
  };

  /**
   * Get current HTML based on view mode
   */
  const getCurrentHtml = () => {
    if (!documentData) return '';
    if (viewMode === 'editor' && editedHtml) {
      return editedHtml;
    }
    // Always use clean HTML (original view removed)
    return documentData.html_clean;
  };

  /**
   * Get current paragraphs based on view mode
   */
  const getCurrentParagraphs = () => {
    if (!documentData) return [];
    // Always use clean paragraphs (original view removed)
    // Clauses are detected from clean paragraphs, so we must use clean for matching
    // Be defensive in case `paragraphs_clean` is missing or not an array
    return Array.isArray(documentData.paragraphs_clean)
      ? documentData.paragraphs_clean
      : [];
  };

  /**
   * Scroll to clause in viewer
   */
  const scrollToClause = (paragraphIndex: number) => {
    // Try to find the first element with this paragraph index
    const element = document.querySelector(`[data-paragraph-index="${paragraphIndex}"]`);
    if (element && viewerRef.current) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  /**
   * Delete clause and merge its text into the preceding clause
   */
  const handleDeleteClause = (clauseToDelete: Clause) => {
    setClauses((currentClauses) => {
      // Find the preceding clause (highest paragraphIndex that is less than deleted clause's index)
      const precedingClause = currentClauses
        .filter(c => c.paragraphIndex < clauseToDelete.paragraphIndex)
        .sort((a, b) => b.paragraphIndex - a.paragraphIndex)[0]; // Get the one with highest index (closest)

      if (precedingClause) {
        // Merge deleted clause's text into preceding clause
        const mergedText = precedingClause.text 
          ? `${precedingClause.text}\n\n${clauseToDelete.clauseNumber} ${clauseToDelete.text}`
          : `${clauseToDelete.clauseNumber} ${clauseToDelete.text}`;

        // Update the preceding clause with merged text
        const updatedClauses = currentClauses.map(c => 
          c.id === precedingClause.id
            ? { ...c, text: mergedText }
            : c
        );

        // Remove the deleted clause
        return updatedClauses.filter(c => c.id !== clauseToDelete.id);
      } else {
        // No preceding clause found, just remove it (first clause in list)
        return currentClauses.filter(c => c.id !== clauseToDelete.id);
      }
    });
    // Remove from selected set if it was selected
    setSelectedClauseIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(clauseToDelete.id);
      return newSet;
    });
  };

  /**
   * Delete multiple selected clauses and merge each into its preceding clause
   */
  const handleDeleteSelected = () => {
    if (selectedClauseIds.size === 0) return;

    setClauses((currentClauses) => {
      // Sort selected clauses by paragraphIndex (ascending) to process in order
      const clausesToDelete = currentClauses
        .filter(c => selectedClauseIds.has(c.id))
        .sort((a, b) => a.paragraphIndex - b.paragraphIndex);

      let updatedClauses = [...currentClauses];

      // Process each selected clause
      clausesToDelete.forEach((clauseToDelete) => {
        // Find the preceding clause (highest paragraphIndex that is less than deleted clause's index)
        // Make sure it's not one of the clauses we're deleting
        const precedingClause = updatedClauses
          .filter(c => c.paragraphIndex < clauseToDelete.paragraphIndex && !selectedClauseIds.has(c.id))
          .sort((a, b) => b.paragraphIndex - a.paragraphIndex)[0]; // Get the one with highest index (closest)

        if (precedingClause) {
          // Merge deleted clause's text into preceding clause
          const mergedText = precedingClause.text 
            ? `${precedingClause.text}\n\n${clauseToDelete.clauseNumber} ${clauseToDelete.text}`
            : `${clauseToDelete.clauseNumber} ${clauseToDelete.text}`;

          // Update the preceding clause with merged text
          updatedClauses = updatedClauses.map(c => 
            c.id === precedingClause.id
              ? { ...c, text: mergedText }
              : c
          );
        }

        // Remove the deleted clause
        updatedClauses = updatedClauses.filter(c => c.id !== clauseToDelete.id);
      });

      return updatedClauses;
    });

    // Clear selection
    setSelectedClauseIds(new Set());
  };

  /**
   * Toggle clause selection
   */
  const handleToggleClauseSelection = (clauseId: string) => {
    setSelectedClauseIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clauseId)) {
        newSet.delete(clauseId);
      } else {
        newSet.add(clauseId);
      }
      return newSet;
    });
  };

  /**
   * Toggle select all clauses
   */
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedClauseIds(new Set(clauses.map(c => c.id)));
    } else {
      setSelectedClauseIds(new Set());
    }
  };

  /**
   * Export clauses and tables to Excel
   * Handles Excel's 32,767 character limit per cell
   */
  const exportToExcel = () => {
    if (clauses.length === 0) {
      setError('No clauses to export');
      return;
    }

    // Excel cell limit is 32,767 characters
    const EXCEL_CELL_LIMIT = 32767;

    const wb = XLSX.utils.book_new();

    // Export clauses (if any)
    if (clauses.length > 0) {
      const clauseRows = clauses.map((c) => {
        let clauseText = c.text || '';

        // Truncate if exceeds Excel limit, but preserve as much as possible
        if (clauseText.length > EXCEL_CELL_LIMIT) {
          // Truncate to limit, but try to end at a word boundary
          let truncated = clauseText.substring(0, EXCEL_CELL_LIMIT - 100);
          const lastSpace = truncated.lastIndexOf(' ');
          if (lastSpace > EXCEL_CELL_LIMIT - 500) {
            truncated = truncated.substring(0, lastSpace);
          }
          clauseText = truncated + '\n\n[... Text truncated due to Excel cell limit (32,767 characters). Full text length: ' + clauseText.length + ' characters ...]';
        }

        // Prepare notes, exceptions, warnings, jurisdiction text
        const notesText = Array.isArray(c.notes) && c.notes.length > 0
          ? c.notes.join('\n\n')
          : '';
        const exceptionsText = Array.isArray(c.exceptions) && c.exceptions.length > 0
          ? c.exceptions.join('\n\n')
          : '';
        const warningsText = Array.isArray(c.warnings) && c.warnings.length > 0
          ? c.warnings.join('\n\n')
          : '';
        const jurisdictionText = Array.isArray(c.jurisdiction) && c.jurisdiction.length > 0
          ? c.jurisdiction.join('\n\n')
          : '';

        // Truncate notes/exceptions if needed
        const truncateText = (text: string): string => {
          if (text.length > EXCEL_CELL_LIMIT) {
            let truncated = text.substring(0, EXCEL_CELL_LIMIT - 100);
            const lastSpace = truncated.lastIndexOf(' ');
            if (lastSpace > EXCEL_CELL_LIMIT - 500) {
              truncated = truncated.substring(0, lastSpace);
            }
            return truncated + '\n\n[... Truncated due to Excel limit ...]';
          }
          return text;
        };

        return {
          'Clause Number': c.clauseNumber,
          'Clause Text': clauseText,
          'Notes': truncateText(notesText),
          'Exceptions': truncateText(exceptionsText),
          'Warnings': truncateText(warningsText),
          'Jurisdiction': truncateText(jurisdictionText),
        };
      });

      const wsClauses = XLSX.utils.json_to_sheet(clauseRows);
      XLSX.utils.book_append_sheet(wb, wsClauses, 'Clauses');
    }

    try {
      XLSX.writeFile(wb, 'export.xlsx');

      // Show warnings if any content was truncated
      const truncatedClauses = clauses.filter(c => (c.text || '').length > EXCEL_CELL_LIMIT).length;
      if (truncatedClauses > 0) {
        setError(`Export successful. Note: ${truncatedClauses} clause(s) were truncated due to Excel's 32,767 character limit per cell.`);
        setTimeout(() => setError(null), 5000);
      } else if (clauses.length > 0) {
        setError('Export successful!');
        setTimeout(() => setError(null), 3000);
      }
    } catch (error: any) {
      setError(`Export failed: ${error.message || 'Unknown error'}`);
    }
  };

  const documentViewerRef = useRef<HTMLDivElement>(null);

  // Memoize paragraph clause map for performance
  const paragraphClauseMap = useMemo(() => {
    const map = new Map<number, Clause>();
    clauses.forEach(clause => {
      map.set(clause.paragraphIndex, clause);
    });
    return map;
  }, [clauses]);

  // Memoize current paragraphs - always use clean paragraphs
  // Clauses are detected from clean paragraphs, so we must use clean for matching
  const currentParagraphs = useMemo(() => {
    if (!documentData) return [];
    return Array.isArray(documentData.paragraphs_clean)
      ? documentData.paragraphs_clean
      : [];
  }, [documentData]);

  // Optimized paragraph matching with early exit
  const findParagraphIndex = useCallback((textContent: string, paragraphs: string[], assignedIndices: Set<number>): number => {
    const trimmedContent = textContent.trim();
    if (!trimmedContent) return -1;

    // Extra safety: if paragraphs is missing or not an array, bail out
    if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
      return -1;
    }

    // First, try exact match (fastest) - prefer unassigned indices
    const exactIndex = paragraphs.findIndex((p, idx) => {
      return p.trim() === trimmedContent && !assignedIndices.has(idx);
    });
    if (exactIndex >= 0) {
      return exactIndex;
    }

    // If no exact match with unassigned, try exact match even if assigned (might be better match)
    const exactIndexAny = paragraphs.findIndex(p => p.trim() === trimmedContent);
    if (exactIndexAny >= 0) {
      return exactIndexAny;
    }

    // If no exact match, try fuzzy match - prefer unassigned indices
    for (let idx = 0; idx < paragraphs.length; idx++) {
      if (assignedIndices.has(idx)) continue;
      const paraText = paragraphs[idx].trim();
      if (!paraText) continue;

      // Quick length check
      if (Math.abs(trimmedContent.length - paraText.length) > trimmedContent.length * 0.5) continue;

      // Fast prefix match - try longer prefixes for better accuracy
      const minLength = Math.min(100, Math.min(trimmedContent.length, paraText.length));
      if (minLength > 0 && trimmedContent.substring(0, minLength) === paraText.substring(0, minLength)) {
        return idx;
      }
    }

    // Last resort: try fuzzy match even if assigned (for better coverage)
    for (let idx = 0; idx < paragraphs.length; idx++) {
      const paraText = paragraphs[idx].trim();
      if (!paraText) continue;

      // Quick length check
      if (Math.abs(trimmedContent.length - paraText.length) > trimmedContent.length * 0.5) continue;

      // Fast prefix match
      const minLength = Math.min(100, Math.min(trimmedContent.length, paraText.length));
      if (minLength > 0 && trimmedContent.substring(0, minLength) === paraText.substring(0, minLength)) {
        return idx;
      }
    }

    return -1;
  }, []);

  /**
   * Add highlighting and click handlers to HTML elements after render
   * Optimized with debouncing and early exits
   */
  useEffect(() => {
    if (!documentData || !documentViewerRef.current || viewMode === 'editor') return;

    // Use requestAnimationFrame to batch DOM updates
    const timeoutId = setTimeout(() => {
      if (!documentViewerRef.current) return;

      const paragraphs = currentParagraphs;
      const elements = documentViewerRef.current.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li');

      // Clear all existing highlights first to ensure we start fresh
      elements.forEach((el) => {
        (el as HTMLElement).classList.remove('clause-highlight');
      });

      // First pass: Direct mapping - for each clause, find its paragraph element
      // This ensures clauses are always highlighted even if text matching is imperfect
      clauses.forEach((clause) => {
        const paragraphIndex = clause.paragraphIndex;
        if (paragraphIndex >= 0 && paragraphIndex < paragraphs.length) {
          const paragraphText = paragraphs[paragraphIndex].trim();
          if (!paragraphText) return;

          // Find the best matching element for this clause's paragraph
          let bestMatch: HTMLElement | null = null;
          let bestScore = 0;

          elements.forEach((el) => {
            const element = el as HTMLElement;
            const elementText = element.textContent?.trim() || '';
            if (!elementText) return;

            // Calculate match score
            let score = 0;

            // Exact match gets highest score
            if (elementText === paragraphText) {
              score = 1000;
            }
            // Check if element text contains paragraph text (or vice versa)
            else if (elementText.includes(paragraphText) || paragraphText.includes(elementText)) {
              // Score based on overlap percentage
              const overlap = Math.min(elementText.length, paragraphText.length);
              const maxLength = Math.max(elementText.length, paragraphText.length);
              score = (overlap / maxLength) * 500;
            }
            // Prefix match - try longer prefixes
            else {
              const minLength = Math.min(200, Math.min(elementText.length, paragraphText.length));
              if (minLength > 0) {
                const elementPrefix = elementText.substring(0, minLength);
                const paraPrefix = paragraphText.substring(0, minLength);
                if (elementPrefix === paraPrefix) {
                  score = minLength;
                }
              }
            }

            // BONUS: If element contains the clause number, boost the score significantly
            // This helps with cases like "3011.1 Part 1: Vented cells" or "1.5.2 Applied part" where the clause number is key
            const clauseNumber = clause.clauseNumber;

            if (clauseNumber) {
              // Escape special regex characters in clause number
              const escapedClauseNumber = clauseNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

              // Check if clause number appears in element text (with flexible matching)
              // Try exact match first
              if (elementText.includes(clauseNumber)) {
                // Check if clause number appears at the start (strong signal)
                if (elementText.trim().startsWith(clauseNumber) ||
                  elementText.match(new RegExp(`^\\s*${escapedClauseNumber}\\b`))) {
                  score += 500; // Very strong boost for clause number at start
                } else {
                  score += 200; // Strong boost for clause number anywhere
                }
              }
              // Also try matching with word boundary (handles cases like "1.5.2" vs "1.5.2 ")
              else {
                const clauseNumberRegex = new RegExp(`\\b${escapedClauseNumber}\\b`);
                if (clauseNumberRegex.test(elementText)) {
                  score += 200; // Strong boost
                }
              }
            }

            if (score > bestScore) {
              bestScore = score;
              bestMatch = element;
            }
          });

          // Always highlight if clause number is found, or if score is reasonable
          // This ensures ALL clauses are highlighted, not just specific ones
          const bestMatchElement = bestMatch as HTMLElement | null;
          const finalHasClauseNumber = bestMatchElement && clause.clauseNumber &&
            (bestMatchElement.textContent?.includes(clause.clauseNumber) ||
              new RegExp(`\\b${clause.clauseNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(bestMatchElement.textContent || ''));

          if (bestMatchElement && (bestScore > 20 || finalHasClauseNumber)) {
            bestMatchElement.classList.add('clause-highlight');
            bestMatchElement.setAttribute('data-paragraph-index', paragraphIndex.toString());
            bestMatchElement.style.cursor = 'pointer';
          }
        }
      });

      // Second pass: Set up click handlers and attributes for ALL elements
      // Make ALL elements clickable, even if they don't match a paragraph index
      // This ensures users can manually mark any clause
      const assignedIndices = new Set<number>();

      // Process elements in batches for better performance
      const batchSize = 50;
      let processed = 0;

      const processBatch = () => {
        const end = Math.min(processed + batchSize, elements.length);

        for (let i = processed; i < end; i++) {
          const element = elements[i] as HTMLElement;
          const textContent = element.textContent?.trim() || '';
          if (!textContent) continue;

          // Make ALL elements clickable (pointer cursor)
          element.style.cursor = 'pointer';

          // Try to find paragraph index
          const paragraphIndex = findParagraphIndex(textContent, paragraphs, assignedIndices);

          if (paragraphIndex >= 0) {
            // Mark as assigned if not already
            if (!assignedIndices.has(paragraphIndex)) {
              assignedIndices.add(paragraphIndex);
            }

            // Add unique ID for scrolling
            element.id = `paragraph-${paragraphIndex}-${i}`;
            element.setAttribute('data-paragraph-index', paragraphIndex.toString());
            element.setAttribute('data-element-text', textContent.substring(0, 200));

            // Check if clause exists for this paragraph index
            const clause = paragraphClauseMap.get(paragraphIndex);

            // Add or remove highlight based on whether clause exists
            // This ensures highlighting always matches the sidebar
            if (clause) {
              element.classList.add('clause-highlight');
            }
            // Don't remove highlight here - it might have been set in first pass
          } else {
            // Even if no paragraph index found, make it clickable for manual marking
            // Store the text so we can use it for manual clause creation
            element.setAttribute('data-element-text', textContent.substring(0, 200));

            // Also check if this element might match a clause by clause number
            // This helps catch cases like 2.4.4.2 that weren't matched in first pass
            clauses.forEach((clause) => {
              if (clause.clauseNumber && textContent.includes(clause.clauseNumber)) {
                // Check if this is likely the right element for this clause
                const clauseNumberRegex = new RegExp(`\\b${clause.clauseNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
                if (clauseNumberRegex.test(textContent)) {
                  // This element contains the clause number - highlight it
                  element.classList.add('clause-highlight');
                  element.setAttribute('data-paragraph-index', clause.paragraphIndex.toString());
                }
              }
            });
          }
        }

        processed = end;

        if (processed < elements.length) {
          requestAnimationFrame(processBatch);
        }
      };

      processBatch();
    }, 50); // Reduced delay for more responsive highlighting updates

    return () => clearTimeout(timeoutId);
  }, [documentData, clauses, viewMode, paragraphClauseMap, currentParagraphs, findParagraphIndex]);
  // Note: viewMode is still needed for 'editor' check, but we always use clean paragraphs now

  /**
   * Render HTML with clause highlighting
   */
  const renderDocument = () => {
    if (!documentData) return null;

    // Always use clean HTML (original view removed)
    const html = documentData.html_clean;

    return (
      <Box
        ref={documentViewerRef}
        className="document-viewer"
        onClick={(e) => {
          console.log('🖱️ Click event triggered');

          // Stop event propagation to prevent conflicts
          e.stopPropagation();

          const target = e.target as HTMLElement;
          console.log('🎯 Click target:', {
            tagName: target.tagName,
            className: target.className,
            hasDataAttr: target.hasAttribute('data-paragraph-index'),
            hasHighlightClass: target.classList.contains('clause-highlight'),
            textPreview: target.textContent?.substring(0, 50)
          });

          // More robust element finding - try multiple strategies
          let paragraphElement: HTMLElement | null = null;
          let strategyUsed = '';

          // Strategy 1: Check if target itself has the attribute
          if (target.hasAttribute('data-paragraph-index')) {
            paragraphElement = target;
            strategyUsed = 'Strategy 1: Target has attribute';
          }
          // Strategy 2: Check if target has clause-highlight class, then find parent with attribute
          else if (target.classList.contains('clause-highlight')) {
            paragraphElement = target;
            // If this element doesn't have the attribute, try to find it on parent
            if (!paragraphElement.hasAttribute('data-paragraph-index')) {
              paragraphElement = target.closest('[data-paragraph-index]') as HTMLElement || target;
            }
            strategyUsed = 'Strategy 2: Target has clause-highlight class';
          }
          // Strategy 3: Use closest to find parent with attribute
          else {
            paragraphElement = target.closest('[data-paragraph-index]') as HTMLElement;
            strategyUsed = 'Strategy 3: closest() search';
          }

          // Strategy 4: If still not found, try finding by clause-highlight class
          if (!paragraphElement || !paragraphElement.hasAttribute('data-paragraph-index')) {
            const highlightedParent = target.closest('.clause-highlight') as HTMLElement;
            if (highlightedParent && highlightedParent.hasAttribute('data-paragraph-index')) {
              paragraphElement = highlightedParent;
              strategyUsed = 'Strategy 4: closest(.clause-highlight)';
            }
          }

          console.log('🔍 Element finding result:', {
            strategyUsed,
            found: !!paragraphElement,
            hasAttribute: paragraphElement?.hasAttribute('data-paragraph-index'),
            paragraphIndex: paragraphElement?.getAttribute('data-paragraph-index'),
            elementTag: paragraphElement?.tagName,
            elementClass: paragraphElement?.className
          });

          if (paragraphElement && paragraphElement.hasAttribute('data-paragraph-index')) {
            const paragraphIndex = paragraphElement.getAttribute('data-paragraph-index');
            const elementText = paragraphElement.getAttribute('data-element-text') ||
              paragraphElement.textContent?.trim() || '';
            if (paragraphIndex !== null) {
              const parsedIndex = parseInt(paragraphIndex, 10);
              const currentTime = Date.now();
              const timeSinceLastClick = currentTime - lastClickTimeRef.current;
              const isSameParagraph = lastClickParagraphIndexRef.current === parsedIndex;

              // Prevent rapid double-clicks on the same paragraph (within 500ms)
              if (isSameParagraph && timeSinceLastClick < 500) {
                console.log('⚠️ Ignoring rapid double-click on same paragraph:', {
                  timeSinceLastClick,
                  paragraphIndex: parsedIndex
                });
                return;
              }

              // Update last click tracking
              lastClickTimeRef.current = currentTime;
              lastClickParagraphIndexRef.current = parsedIndex;

              console.log('✅ Calling toggleClauseHighlight with:', {
                paragraphIndex: parsedIndex,
                elementTextLength: elementText.length,
                elementTextPreview: elementText.substring(0, 100)
              });
              // Direct call without requestAnimationFrame for immediate response
              toggleClauseHighlight(parsedIndex, elementText);
            } else {
              console.log('❌ paragraphIndex is null');
            }
          } else {
            console.log('❌ No paragraph element found or missing data-paragraph-index attribute');
          }
        }}
        sx={{
          '& .clause-highlight': {
            backgroundColor: 'yellow',
            padding: '4px 8px',
            borderRadius: '4px',
            transition: 'background-color 0.2s ease',
          },
          '& [data-paragraph-index]': {
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
            },
          },
          '& .clause-highlight:hover': {
            backgroundColor: '#ffeb3b',
          },
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      )}

      {/* Main content area */}
      {documentData && !loading && (
        <Grid container spacing={2}>
          {/* Document Viewer/Editor */}
          <Grid item xs={12} md={8}>
            <Paper
              ref={viewerRef}
              sx={{
                p: 3,
                height: '80vh',
                overflow: 'auto',
                backgroundColor: '#fafafa',
              }}
            >
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="h6">
                  {viewMode === 'editor' ? 'Document Editor' : 'Document Viewer'}
                </Typography>
                <Box display="flex" alignItems="center" gap={2}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={showPreview}
                        onChange={(e) => setShowPreview(e.target.checked)}
                        size="small"
                      />
                    }
                    label="Show Document Preview"
                  />
                  <ToggleButtonGroup
                    value={viewMode}
                    exclusive
                    onChange={(_, newMode) => newMode && setViewMode(newMode)}
                    size="small"
                  >
                    <ToggleButton value="clean">View: Clean</ToggleButton>
                    <ToggleButton value="editor">View: Editor</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              </Box>

              {!showPreview ? (
                <Box
                  sx={{
                    p: 4,
                    textAlign: 'center',
                    backgroundColor: '#f5f5f5',
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="body1" color="text.secondary">
                    Document preview is disabled for better performance.
                    <br />
                    <Typography variant="caption" component="span">
                      You can still view clauses in the sidebar and export to Excel.
                    </Typography>
                    <br />
                    <Typography variant="caption" component="span" sx={{ mt: 1, display: 'block' }}>
                      Enable "Show Document Preview" above to view the document.
                    </Typography>
                  </Typography>
                </Box>
              ) : viewMode === 'editor' ? (
                <DocumentEditor
                  html={getCurrentHtml()}
                  clauses={clauses}
                  paragraphs={getCurrentParagraphs()}
                  onUpdate={handleEditorUpdate}
                  onParagraphClick={toggleClauseHighlight}
                />
              ) : (
                <Box
                  sx={{
                    '& .clause-highlight': {
                      backgroundColor: 'yellow',
                      padding: '4px 8px',
                      borderRadius: '4px',
                    },
                  }}
                >
                  {renderDocument()}
                </Box>
              )}
            </Paper>
          </Grid>

          {/* Clause Sidebar */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, height: '80vh', overflow: 'auto' }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="h6">
                  Detected Clauses ({clauses.length})
                </Typography>
                <Box display="flex" gap={1}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,.doc"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                  <Button
                    variant="contained"
                    startIcon={<UploadIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    size="small"
                  >
                    Upload
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<ExportIcon />}
                    onClick={exportToExcel}
                    disabled={clauses.length === 0}
                    size="small"
                  >
                    Export
                  </Button>
                </Box>
              </Box>

              {clauses.length > 0 && (
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1} px={1}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={selectedClauseIds.size === clauses.length && clauses.length > 0}
                        indeterminate={selectedClauseIds.size > 0 && selectedClauseIds.size < clauses.length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2">
                        Select All {selectedClauseIds.size > 0 && `(${selectedClauseIds.size} selected)`}
                      </Typography>
                    }
                  />
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={handleDeleteSelected}
                    disabled={selectedClauseIds.size === 0}
                    size="small"
                  >
                    Delete Selected
                  </Button>
                </Box>
              )}

              {!documentData && !loading && (
                <Typography variant="body2" color="text.secondary">
                  Upload a .docx to get started.
                </Typography>
              )}

              {clauses.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No clauses detected. Click on paragraphs to mark them manually.
                </Typography>
              ) : (
                <List>
                  {clauses.map((clause) => (
                    <ListItem
                      key={clause.id}
                      secondaryAction={
                        <IconButton
                          edge="end"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClause(clause);
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      }
                      sx={{
                        cursor: 'pointer',
                        backgroundColor: selectedClauseIds.has(clause.id) ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                        '&:hover': {
                          backgroundColor: selectedClauseIds.has(clause.id) 
                            ? 'rgba(25, 118, 210, 0.12)' 
                            : 'rgba(0, 0, 0, 0.05)',
                        },
                      }}
                      onClick={() => scrollToClause(clause.paragraphIndex)}
                    >
                      <Checkbox
                        checked={selectedClauseIds.has(clause.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleClauseSelection(clause.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        size="small"
                        sx={{ mr: 1 }}
                      />
                      <ListItemText
                        primary={
                          <Typography variant="subtitle2" fontWeight="bold">
                            {clause.clauseNumber}
                            {(clause.notes && clause.notes.length > 0) && (
                              <Typography component="span" variant="caption" sx={{ ml: 1, color: 'info.main' }}>
                                📝 {clause.notes.length}
                              </Typography>
                            )}
                            {(clause.exceptions && clause.exceptions.length > 0) && (
                              <Typography component="span" variant="caption" sx={{ ml: 1, color: 'warning.main' }}>
                                ⚠️ {clause.exceptions.length}
                              </Typography>
                            )}
                            {(clause.warnings && clause.warnings.length > 0) && (
                              <Typography component="span" variant="caption" sx={{ ml: 1, color: 'error.main' }}>
                                ⚡ {clause.warnings.length}
                              </Typography>
                            )}
                            {(clause.jurisdiction && clause.jurisdiction.length > 0) && (
                              <Typography component="span" variant="caption" sx={{ ml: 1, color: 'secondary.main' }}>
                                🌏 {clause.jurisdiction.length}
                              </Typography>
                            )}
                          </Typography>
                        }
                        secondary={
                          <Box>
                            <Typography
                              variant="body2"
                              sx={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }}
                            >
                              {(clause.text || '').substring(0, 80)}
                              {(clause.text || '').length > 80 ? '...' : ''}
                            </Typography>
                            {clause.notes && Array.isArray(clause.notes) && clause.notes.length > 0 && clause.notes[0] && (
                              <Typography variant="caption" color="info.main" sx={{ display: 'block', mt: 0.5 }}>
                                Note: {clause.notes[0].substring(0, 50)}{clause.notes[0].length > 50 ? '...' : ''}
                              </Typography>
                            )}
                            {clause.exceptions && Array.isArray(clause.exceptions) && clause.exceptions.length > 0 && clause.exceptions[0] && (
                              <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
                                Exception: {clause.exceptions[0].substring(0, 50)}{clause.exceptions[0].length > 50 ? '...' : ''}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}

      {!documentData && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h5" gutterBottom>
            Word Processor + Clause Highlighter
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Upload a .docx file to get started. The system will automatically detect
            Australian AS / AS-NZS clauses and allow you to mark or unmark them.
            <br />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Note: .docx format is required. If you have a .doc file, please convert it to .docx first.
            </Typography>
          </Typography>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.doc"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <Button
            variant="contained"
            size="large"
            startIcon={<UploadIcon />}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload Your First Document
          </Button>
        </Paper>
      )}
    </Container>
  );
}


