# Word Processor + Clause Highlighter + Excel Export

A local web-based application that processes Word documents (.docx), automatically detects and highlights Australian NCC / AS / AS-NZS clauses using deterministic regex patterns, and exports detected clauses to Excel. All processing is rule-based with no LLM/AI dependencies.

---

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture Overview](#architecture-overview)
- [Complete Project Structure](#complete-project-structure)
- [How It Works](#how-it-works)
- [Component Details](#component-details)
- [Data Flow](#data-flow)
- [Installation & Usage](#installation--usage)
- [Extending the System](#extending-the-system)
- [Development Guidelines](#development-guidelines)
- [Known Limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

---

## Features

- ✅ **DOCX Upload & Conversion**: Loads .docx files and converts them to HTML using Mammoth.js
- ✅ **Format Repair**: Automatically cleans formatting issues (gaps, broken lines, weird spacing) while preserving content
- ✅ **Clause Detection**: Detects Australian NCC / AS / AS-NZS clauses using deterministic regex patterns
- ✅ **Manual Mark/Unmark**: Click paragraphs to manually mark or unmark clauses
- ✅ **Excel Export**: Export all detected clauses to .xlsx format with clause numbers and text
- ✅ **Excel Processor**: Import and process existing Excel files with clause data
- ✅ **Clean View & Editor**: View cleaned document or edit in rich text editor
- ✅ **Table Extraction**: Automatically extracts tables from documents
- ✅ **No LLM/AI**: All processing is deterministic and rule-based

---

## Technology Stack

### Frontend
- **Next.js 14** - React framework with server-side rendering
- **React 18** - UI library
- **Material-UI (MUI) v5.14.0** - Component library with Emotion (CSS-in-JS)
- **TipTap** - Rich text editor for document editing

### Backend
- **Next.js API Routes** - Server-side API endpoints
- **Mammoth.js** - DOCX to HTML conversion
- **formidable** - File upload handling
- **sanitize-html** - HTML sanitization
- **unified/rehype** - HTML processing and format repair

### Data Processing
- **SheetJS (xlsx)** - Excel file generation and parsing
- **uuid** - Unique ID generation for clauses
- **Custom regex engine** - Clause detection patterns

---

## Architecture Overview

The application follows a **client-server architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React/Next.js)                  │
├─────────────────────────────────────────────────────────────┤
│  ClausesWorkspace                                            │
│    ├── WordProcessor (Upload/View/Export)                   │
│    │   ├── Document Upload                                  │
│    │   ├── Clause Detection & Highlighting                │
│    │   ├── Document Viewer (Clean/Editor)                  │
│    │   └── Excel Export                                     │
│    └── ExcelProcessor (Import/Process)                     │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTP
┌─────────────────────────────────────────────────────────────┐
│              Backend API (Next.js API Routes)               │
├─────────────────────────────────────────────────────────────┤
│  /api/upload-docx                                           │
│    ├── File Upload (formidable)                             │
│    ├── DOCX → HTML (Mammoth)                                │
│    ├── Format Repair Pipeline                               │
│    └── Return Clean HTML/Text/Paragraphs                    │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    Processing Libraries                      │
├─────────────────────────────────────────────────────────────┤
│  lib/clause-detector.ts    - Regex-based clause detection   │
│  lib/format-repair.ts      - HTML/text cleanup              │
│  lib/table-extractor.ts    - Table extraction               │
└─────────────────────────────────────────────────────────────┘
```

---

## Complete Project Structure

```
wordprocessor-clause-highlighter/
├── pages/
│   ├── _app.tsx                    # MUI ThemeProvider wrapper
│   ├── index.tsx                   # Main entry point - renders ClausesWorkspace
│   ├── excel-processor.tsx        # Standalone Excel processor page (optional route)
│   └── api/
│       └── upload-docx.ts         # API endpoint: DOCX upload, conversion, format repair
│
├── components/
│   ├── ClausesWorkspace.tsx       # Main workspace with 3 sub-tabs
│   ├── WordProcessor.tsx          # Core component: upload, view, clause management, export
│   ├── ExcelProcessor.tsx         # Excel file import and processing
│   └── DocumentEditor.tsx        # TipTap rich text editor component
│
├── lib/
│   ├── clause-detector.ts         # Regex-based clause detection engine
│   ├── format-repair.ts           # HTML/text cleanup pipeline
│   └── table-extractor.ts         # Table extraction utilities
│
├── types/
│   └── index.ts                   # TypeScript interfaces (Clause, DocumentData, etc.)
│
├── styles/
│   └── globals.css                # Global CSS styles
│
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript config with @/* path alias
├── next.config.js                 # Next.js config (10MB upload limit)
└── README.md                      # This file
```

---

## How It Works

### 1. Document Upload Flow

```
User uploads .docx
    ↓
Frontend: FormData → POST /api/upload-docx
    ↓
Backend: formidable parses multipart form
    ↓
Mammoth.js converts DOCX → HTML (raw)
    ↓
Format Repair Pipeline:
  - Sanitize HTML (remove junk Word markup)
  - Normalize whitespace
  - Remove empty paragraphs
  - Join broken lines
  - Extract clean paragraphs
    ↓
Return: { html_clean, text_clean, paragraphs_clean }
    ↓
Frontend: Display document, auto-detect clauses
```

### 2. Clause Detection Flow

```
Clean paragraphs → detectAllClauses()
    ↓
For each paragraph:
  - Try regex patterns in order (most specific first)
  - Extract clause number and text
  - Apply exclusion filters (tables, figures, etc.)
  - Create Clause object with unique ID
    ↓
Return: Clause[] array
    ↓
Frontend: Highlight clauses in document, show in sidebar
```

### 3. Manual Marking Flow

```
User clicks paragraph
    ↓
Check if clause already exists for this paragraph
    ↓
If exists: Remove clause (unmark)
If not: Prompt user for clause number
    ↓
Create new Clause object (markedBy: 'manual')
    ↓
Update state → Re-render with highlight
```

### 4. Excel Export Flow

```
Clauses array → Process
    ↓
Create SheetJS workbook
    ↓
Add worksheet with columns:
  - Column A: Clause Number
  - Column B: Clause Text
    ↓
Generate .xlsx file → Download
```

---

## Component Details

### `pages/index.tsx`
**Purpose**: Main application entry point

**What it does**:
- Renders the `ClausesWorkspace` component
- Provides Material-UI container and theme

**Key Code**:
```typescript
export default function Home() {
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <ClausesWorkspace />
    </Container>
  );
}
```

---

### `components/ClausesWorkspace.tsx`
**Purpose**: Main workspace container with tab navigation

**What it does**:
- Provides 3 sub-tabs: "Upload Word File", "Export to Excel", "Excel Processor"
- Routes to appropriate component based on selected tab
- Upload and Export tabs both use `WordProcessor` (same underlying workspace)

**State Management**:
- `subTab`: Current tab selection ('upload' | 'export' | 'excel')

**Key Code**:
```typescript
{(subTab === 'upload' || subTab === 'export') && (
  <WordProcessor />
)}

{subTab === 'excel' && (
  <ExcelProcessor />
)}
```

---

### `components/WordProcessor.tsx`
**Purpose**: Core document processing and clause management component

**What it does**:
1. **File Upload**: Handles .docx file selection and upload
2. **Document Display**: Shows document in "Clean" or "Editor" view mode
3. **Clause Detection**: Auto-detects clauses on document load
4. **Manual Marking**: Allows clicking paragraphs to mark/unmark clauses
5. **Clause Management**: Displays clauses in sidebar with delete functionality
6. **Excel Export**: Exports detected clauses to .xlsx file
7. **Table Extraction**: Extracts and displays tables from document

**State Management**:
- `documentData`: Processed document (HTML, text, paragraphs)
- `clauses`: Array of detected/manually marked clauses
- `tables`: Array of extracted tables
- `viewMode`: 'clean' | 'editor'
- `loading`: Upload/processing state
- `error`: Error messages
- `editedHtml`: Edited HTML from TipTap editor

**Key Functions**:
- `handleFileUpload()`: Uploads file, processes, detects clauses
- `toggleClauseHighlight()`: Marks/unmarks clauses on paragraph click
- `exportToExcel()`: Generates and downloads Excel file
- `handleEditorChange()`: Updates edited HTML from TipTap

**Clause Highlighting Logic**:
- Uses `data-clause-id` attributes on paragraph elements
- CSS classes: `.clause-highlight` for visual highlighting
- Sidebar shows all clauses with delete buttons
- Clicking highlighted paragraph unmarks it
- Clicking unmarked paragraph prompts for clause number

---

### `components/ExcelProcessor.tsx`
**Purpose**: Import and process existing Excel files with clause data

**What it does**:
1. **Excel Import**: Reads .xlsx files using SheetJS
2. **Comma Corruption Fix**: Automatically fixes OCR errors (commas → dots in clause numbers)
3. **Data Validation**: Validates and cleans clause data
4. **CSV Export**: Exports processed data to CSV format
5. **Standard Prefix**: Allows setting standard prefix (e.g., "as3000") for clause numbers

**Key Functions**:
- `fixCommaCorruption()`: Fixes comma corruption in clause numbers (e.g., "4.4,2" → "4.4.2")
- `handleExcelUpload()`: Processes uploaded Excel file
- `exportToCSV()`: Exports processed data to CSV

**Comma Corruption Rules**:
- **Rule A**: Simple continuation - `4.4,2` → `4.4.2`
- **Rule B**: Deeper continuation - `8.3,1.3.3` → `8.3.1.3.3`
- **Rule C**: Ambiguous cases - requires user confirmation

---

### `components/DocumentEditor.tsx`
**Purpose**: Rich text editor using TipTap

**What it does**:
- Displays document HTML in editable TipTap editor
- Allows editing document content
- Preserves formatting (bold, italic, headings, lists)
- Emits changes back to parent component

**TipTap Extensions**:
- StarterKit (basic formatting)
- Document (multi-column support)
- Placeholder (shows placeholder text)

---

### `pages/api/upload-docx.ts`
**Purpose**: Server-side API endpoint for DOCX processing

**What it does**:
1. Receives .docx file via multipart/form-data
2. Validates file type (.docx only, rejects .doc)
3. Converts DOCX to HTML using Mammoth.js
4. Applies format repair pipeline
5. Returns cleaned HTML, text, and paragraphs

**Process Flow**:
```
POST /api/upload-docx
  ↓
formidable.parse() → Extract file
  ↓
mammoth.convertToHtml() → HTML (raw)
  ↓
repairFormat() → { html_clean, text_clean, paragraphs_clean }
  ↓
Return JSON response
```

**Error Handling**:
- Validates .docx file type
- Rejects .doc files with helpful error message
- Handles file size limits (10MB)
- Returns structured error responses

---

### `lib/clause-detector.ts`
**Purpose**: Regex-based clause detection engine

**What it does**:
- Defines regex patterns for different clause formats
- Tries patterns in order (most specific first)
- Filters false positives (tables, figures, etc.)
- Returns array of detected clauses

**Clause Patterns** (in order of specificity):

1. **Clauses with subclause**: `D1.6(a)`, `2.6.3.3.2(a)`, `E2.2a(b)`
   ```regex
   /^\s*((?:\d+(?:\.\d+){1,4})|(?:[A-Z]{1,2}\d+(?:\.\d+)*[a-z]?)|(?:[A-Z]\.\d+(?:\.\d+){0,3}))(\([a-zivx]+\))?\s*[ .\-–:]*\s*(.*)$/
   ```

2. **Numeric clauses**: `2.6`, `2.6.3`, `2.6.3.3.2`
   ```regex
   /^\s*(\d+(?:\.\d+){1,4})\s*[ .\-–:]*\s*(.*)$/
   ```

3. **Lettered clauses**: `E2.2`, `E2.2a`, `FP1.4`, `CP1`, `GP5.2`
   ```regex
   /^\s*([A-Z]{1,2}\d+(?:\.\d+)*[a-z]?)\s*[ .\-–:]*\s*(.*)$/
   ```

4. **Appendix clauses**: `A.1`, `A.1.2`, `B.3.4.1`
   ```regex
   /^\s*([A-Z]\.\d+(?:\.\d+){0,3})\s*[ .\-–:]*\s*(.*)$/
   ```

**Exclusion Filters**:
- Table references: "Table", "TABLE", "Tab."
- Figure references: "Figure", "FIGURE", "Fig."
- Page references: "Page", "P.", "pp."
- Unit measurements: "mm", "m²", "kg/m³"
- Empty or very short text
- Text starting with numbers only (likely not clauses)

**Key Function**:
```typescript
export function detectAllClauses(paragraphs: string[]): Clause[]
```

---

### `lib/format-repair.ts`
**Purpose**: HTML and text cleanup pipeline

**What it does**:
1. **HTML Sanitization**: Removes junk Word markup while preserving structure
2. **Whitespace Normalization**: Removes multiple spaces, normalizes newlines
3. **Empty Paragraph Removal**: Cleans up empty or duplicate paragraphs
4. **Line Break Joining**: Joins broken lines caused by Word line-wrap
5. **De-hyphenation**: Fixes wrapped words (e.g., "inter-\nnational" → "international")

**Important**: The repair pipeline does NOT rewrite or paraphrase content. It only fixes formatting issues deterministically.

**Key Functions**:
- `repairFormat()`: Main entry point - returns cleaned HTML, text, and paragraphs
- `sanitizeHtmlContent()`: Removes unsafe HTML while preserving structure
- `normalizeWhitespace()`: Normalizes whitespace (less aggressive to preserve clause numbers)
- `removeEmptyParagraphs()`: Removes empty `<p>` tags
- `joinBrokenLines()`: Joins hyphenated line breaks
- `extractParagraphs()`: Extracts paragraphs from HTML

**Sanitization Rules**:
- **Allowed tags**: `p`, `h1-h6`, `ul`, `ol`, `li`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `strong`, `em`, `b`, `i`, `u`, `br`, `span`, `div`, `blockquote`
- **Allowed attributes**: `class`, `id`, `style` (with restrictions)
- **Allowed styles**: `text-align`, `font-weight`, `font-style`

---

### `lib/table-extractor.ts`
**Purpose**: Extract tables from HTML documents

**What it does**:
- Finds all `<table>` elements in HTML
- Extracts table structure (headers, rows, cells)
- Generates metadata (row count, column count)
- Returns array of `ExtractedTable` objects

**Key Function**:
```typescript
export function extractTables(html: string, paragraphs: string[]): ExtractedTable[]
```

---

### `types/index.ts`
**Purpose**: TypeScript type definitions

**Key Interfaces**:

```typescript
interface Clause {
  id: string;                    // Unique UUID
  clauseNumber: string;           // e.g., "2.6.3", "E2.2a"
  text: string;                  // Clause text content
  paragraphIndex: number;         // Index in paragraphs array
  markedBy: 'auto' | 'manual';    // How it was detected
}

interface DocumentData {
  html_clean: string;            // Cleaned HTML
  text_clean: string;            // Cleaned text
  paragraphs_clean: string[];    // Array of paragraph strings
}

interface ExtractedTable {
  id: string;
  html: string;
  rowCount: number;
  columnCount: number;
}
```

---

## Data Flow

### Complete Processing Pipeline

```
1. User uploads .docx file
   ↓
2. Frontend: FormData → POST /api/upload-docx
   ↓
3. Backend: formidable.parse() → Extract file
   ↓
4. Backend: mammoth.convertToHtml() → HTML (raw)
   ↓
5. Backend: repairFormat()
   ├── sanitizeHtmlContent() → Remove junk markup
   ├── removeEmptyParagraphs() → Clean empty tags
   ├── cleanHtmlStructure() → Rehype processing
   ├── normalizeWhitespace() → Normalize spacing
   ├── joinBrokenLines() → Fix line breaks
   └── extractParagraphs() → Extract paragraph array
   ↓
6. Backend: Return { html_clean, text_clean, paragraphs_clean }
   ↓
7. Frontend: Receive DocumentData
   ↓
8. Frontend: detectAllClauses(paragraphs_clean)
   ├── For each paragraph:
   │   ├── Try regex patterns (most specific first)
   │   ├── Extract clause number and text
   │   ├── Apply exclusion filters
   │   └── Create Clause object
   └── Return Clause[]
   ↓
9. Frontend: extractTables(html_clean, paragraphs_clean)
   └── Return ExtractedTable[]
   ↓
10. Frontend: Display document with highlights
    ├── Render HTML with clause highlights
    ├── Show clauses in sidebar
    └── Show tables in sidebar
```

### State Management Flow

```
WordProcessor Component State:
├── documentData: DocumentData | null
│   └── Set on file upload
│
├── clauses: Clause[]
│   ├── Initial: Auto-detected from paragraphs
│   ├── Updated: On manual mark/unmark
│   └── Used: For highlighting and export
│
├── tables: ExtractedTable[]
│   └── Set on file upload
│
├── viewMode: 'clean' | 'editor'
│   └── Toggled by user
│
└── editedHtml: string | null
    └── Updated from TipTap editor
```

---

## Installation & Usage

### Installation

1. **Clone or download this repository**

2. **Install dependencies**:
   ```bash
   npm install
   ```
   
   This installs all required packages including:
   - Next.js 14, React 18
   - Material-UI v5.14.0
   - Mammoth.js (DOCX conversion)
   - SheetJS/xlsx (Excel export)
   - TipTap (rich text editor)
   - And other dependencies (see `package.json`)

3. **Run the development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

### Usage

#### Uploading a Document

1. Click the **"Upload Word File"** button
2. Select a .docx file from your computer
3. The document will be processed and displayed in the viewer

**Note**: Only .docx files are supported. If you have a .doc file (older format), please convert it to .docx first by opening it in Microsoft Word and saving as .docx format.

#### Viewing Documents

- Use the **"View: Clean"** button to view the document after format repair
- Use the **"View: Editor"** button to edit the document in a rich text editor
- The clean view shows the document with formatting issues automatically fixed

#### Clause Detection

Clauses are automatically detected when you upload a document. The system recognizes:

- **Numeric clauses**: `2.6`, `2.6.3`, `2.6.3.3.2`
- **Lettered clauses**: `E2.2`, `E2.2a`, `FP1.4`, `CP1`, `GP5.2`
- **Appendix clauses**: `A.1`, `A.1.2`, `B.3.4.1`
- **Clauses with subclauses**: `D1.6(a)`, `2.6.3.3.2(a)`

#### Manual Marking/Unmarking

- **To mark a clause**: Click on any unmarked paragraph. You'll be prompted to enter a clause number.
- **To unmark a clause**: Click on a highlighted clause, or click the delete icon (🗑️) in the clause sidebar.

#### Exporting to Excel

1. Ensure you have detected clauses (they appear in the sidebar)
2. Click the **"Export to Excel"** button
3. A file named `clauses.xlsx` will be downloaded with:
   - **Column A**: Clause Number
   - **Column B**: Clause Text

#### Excel Processor

1. Go to the **"Excel Processor"** tab
2. Upload an existing Excel file with clause data
3. The system will:
   - Fix comma corruption in clause numbers (e.g., "4.4,2" → "4.4.2")
   - Validate and clean data
   - Allow export to CSV format

---

## Extending the System

### Adding New Clause Detection Patterns

To add new clause detection patterns or modify existing ones:

1. **Edit `lib/clause-detector.ts`**:
   - Add new regex patterns to the `CLAUSE_PATTERNS` array
   - Patterns are tried in order (most specific first)
   - Each pattern should extract `clauseNumber` and `text`

2. **Add exclusion filters**:
   - Edit the `shouldExclude()` function to filter out false positives
   - Current exclusions: tables, figures, page references, unit measurements

3. **Example pattern addition**:
   ```typescript
   {
     name: 'custom_pattern',
     regex: /^\s*(YOUR_PATTERN)\b[ .\-–:]?(.*)$/,
     extractGroups: (match: RegExpMatchArray) => ({
       clauseNumber: match[1],
       text: (match[2] || '').trim()
     })
   }
   ```

### Adding New Export Formats

To add new export formats (e.g., CSV, JSON):

1. Create a new function in the appropriate component
2. Use SheetJS or a similar library to generate the file
3. Add a new button/action in the UI
4. Follow the existing Excel export pattern

### Adding New File Format Support

To support additional file formats (e.g., PDF, RTF):

1. Add a new API endpoint in `pages/api/`
2. Use appropriate conversion library (e.g., pdf-parse for PDF)
3. Integrate with existing format repair pipeline
4. Update file validation in upload handler

---

## Development Guidelines

### Code Preservation Principle

**IMPORTANT**: When making future changes to this codebase, the existing code must be preserved and not heavily modified.

#### Guidelines for Future Changes:

1. **Preserve Existing Functionality**
   - Do not remove or drastically alter existing features
   - Maintain backward compatibility
   - Keep existing code structure intact

2. **Additive Changes Preferred**
   - Prefer adding new features over modifying existing ones
   - Use feature flags or configuration when possible
   - Extend functionality rather than replace it

3. **Minimal Impact Modifications**
   - When fixes are needed, make surgical changes
   - Preserve existing function signatures and interfaces
   - Maintain existing data structures and types

4. **Documentation of Changes**
   - Document any necessary breaking changes
   - Provide migration paths if interfaces must change
   - Update this README when making significant architectural decisions

5. **Testing Before Changes**
   - Verify existing functionality still works after changes
   - Test with existing documents and use cases
   - Ensure clause detection patterns remain functional

### Key Components to Preserve:

- **Clause Detection Engine** (`lib/clause-detector.ts`) - Regex patterns are working well
- **Format Repair Pipeline** (`lib/format-repair.ts`) - Carefully tuned to preserve clause numbers
- **Document Upload/Processing** (`pages/api/upload-docx.ts`) - Stable conversion pipeline
- **UI Components** (`components/WordProcessor.tsx`) - Functional document viewer and clause management

### Areas That Can Be Extended:

- Additional clause detection patterns (add new patterns, don't modify existing ones)
- New export formats (add alongside Excel export)
- Additional file format support (add new handlers, keep .docx support)
- UI enhancements (add features, preserve existing layout)

---

## Known Limitations

- **Large documents (>10MB)**: May take longer to process
- **Complex table formatting**: May not be perfectly preserved
- **Word-specific formatting**: Some Word-specific formatting (e.g., tracked changes) is not supported
- **Pure subclauses**: Like `(a)`, `(i)` are detected but not exported by default
- **.doc files**: Older .doc format is not supported (must convert to .docx)
- **File size limit**: 10MB upload limit (configurable in `next.config.js`)

---

## Troubleshooting

### File upload fails

- Ensure the file is a valid .docx file
- Check file size (limit is 10MB, configurable)
- Check browser console for errors
- Verify the file is not corrupted

### Clauses not detected

- Verify the document contains clause numbers matching the regex patterns
- Try manually marking clauses if auto-detection misses them
- Check the exclusion filters in `lib/clause-detector.ts`
- Ensure format repair didn't corrupt clause numbers

### Formatting looks wrong

- Try switching between "Clean" and "Editor" views
- Some Word formatting may not convert perfectly
- Check the format repair pipeline settings in `lib/format-repair.ts`
- Verify the original .docx file is not corrupted

### Excel export fails

- Ensure you have at least one clause detected
- Check browser console for errors
- Verify SheetJS library is properly installed
- Try exporting with a smaller number of clauses first

### Excel processor issues

- Verify the Excel file has the expected column structure
- Check for comma corruption in clause numbers
- Ensure the file is not password-protected
- Verify the file is a valid .xlsx format

---

## License

This project is provided as-is for local use.

---

## Notes for Future Extension

- **Notes/Exceptions**: To add support for notes and exceptions, extend the clause detection to recognize patterns like "Note:", "Exception:", and link them to parent clauses
- **Figures/Tables**: Currently extracted but could be enhanced with better metadata extraction
- **Cross-references**: Could be added to detect and link clause references within the document
- **Multiple documents**: Could be extended to process multiple documents and merge clause lists
- **Batch processing**: Could add support for processing multiple files at once
- **Cloud storage**: Could integrate with cloud storage services for document management

---

**Last Updated**: Current session  
**Status**: Code is stable and functional - preserve this state
