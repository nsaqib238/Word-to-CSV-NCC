# NCC CSV Structure Specification

This document provides a complete specification for creating NCC (National Construction Code) CSV files from DOCX documents. Use this as a reference when re-implementing the NCC processing system.

---

## Table of Contents

1. [Overview](#overview)
2. [CSV Column Structure](#csv-column-structure)
3. [Unit Types](#unit-types)
4. [Processing Flow](#processing-flow)
5. [Data Extraction Rules](#data-extraction-rules)
6. [Post-Processing Steps](#post-processing-steps)
7. [Field Value Enumerations](#field-value-enumerations)

---

## Overview

### Purpose
The NCC CSV file is a structured representation of NCC documents (Volumes 1, 2, and 3) that:
- Extracts all clauses, provisions, requirements, and related content
- Maintains hierarchical relationships between units
- Preserves state variations and amendments
- Enables RAG (Retrieval-Augmented Generation) for AI systems
- Supports database import and querying

### Input
- **Format**: Microsoft Word DOCX files (.docx)
- **Source**: NCC 2022 documents (Volume One, Volume Two, Volume Three)
- **Size**: Typically 3-8 MB per volume

### Output
- **Format**: CSV (Comma-Separated Values)
- **Encoding**: UTF-8
- **Row Count**: 3,000-10,000 rows per volume
- **Column Count**: 72 columns

---

## CSV Column Structure

The CSV file contains **72 columns** in the following order:

### 1. Identity Fields (5 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `doc_id` | string | Document identifier | `"ncc2022"` |
| `volume` | string | Volume name | `"Volume Two"` |
| `state_variation` | string | State variation identifier (empty for national) | `""` or `"VIC"` |
| `version_date` | string | Version year (kept empty as requested) | `""` |
| `source_file` | string | Source DOCX filename | `"NCC2022-volume-two.docx"` |

### 2. Navigation & Hierarchy (7 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `path` | string | Hierarchical path | `"Volume Two > Part H1 > H1P1"` |
| `anchor_id` | string | Unique identifier for this row | `"ncc2022_v2_h1p1_001"` |
| `parent_anchor_id` | string | Parent row's anchor_id | `"ncc2022_v2_h1_000"` |
| `order_in_parent` | number | Order within parent (0-indexed) | `0`, `1`, `2` |
| `para_start` | number | Starting paragraph index | `1234` |
| `para_end` | number | Ending paragraph index | `1236` |
| `indexable` | boolean | Whether row should be indexed | `true` or `false` |

### 3. NCC Semantics (3 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `unit_label` | string | Clause identifier/number | `"E3P1"`, `"C2D5"`, `"H1P1"` |
| `unit_type` | string | Type of unit (see Unit Types section) | `"PERFORMANCE_REQUIREMENT"` |
| `compliance_weight` | string | Legal weight | `"MANDATORY"`, `"OPTIONAL_PATHWAY"`, `"NON_MANDATORY"` |

### 4. Text Payload (9 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `title` | string | Clause heading (first sentence after unit_label) | `"Buildings must resist fire spread."` |
| `text` | string | Full clause text content | `"Buildings must resist fire spread. The building..."` |
| `text_html` | string | HTML version of text (currently empty) | `""` |
| `rag_text` | string | Formatted text for RAG | `"[PERFORMANCE_REQUIREMENT] E3P1\ntitle: Buildings must resist fire spread.\ntext: ..."` |
| `notes` | string | Notes and explanatory information | `"NOTE: This applies to all building classes."` |
| `exceptions` | string | Exception clauses | `"EXCEPTION: Class 1 buildings are exempt."` |
| `defined_term` | string | Defined term extracted from text | `"fire resistance"` |
| `contains_shall` | boolean | Whether text contains "shall" | `true` or `false` |
| `contains_must` | boolean | Whether text contains "must" | `true` or `false` |

### 5. References & Links (4 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `external_refs` | string | JSON array of external references | `"[\"AS 3000\", \"AS 3600\"]"` |
| `internal_refs` | string | JSON array of internal clause references | `"[\"E3P2\", \"C2D5\"]"` |
| `satisfies_pr_ids` | string | JSON array of anchor_ids this satisfies | `"[\"anchor_001\", \"anchor_002\"]"` |
| `related_unit_ids` | string | JSON array of related anchor_ids | `"[\"anchor_003\"]"` |

### 6. Figures & Tables (4 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `asset_type` | string | Type of asset | `"NONE"`, `"IMAGE"`, `"TABLE"` |
| `asset_id` | string | Asset identifier | `"Table D2.1"` |
| `asset_caption` | string | Caption/title of asset | `"Table D2.1: Fire resistance periods"` |
| `asset_alt_text` | string | Alternative text/description | `"Table showing fire resistance periods..."` |

### 7. Traceability & QA (5 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `page_start` | string | Starting page number | `"45"` |
| `page_end` | string | Ending page number | `"46"` |
| `bbox_json` | string | Bounding box coordinates (JSON) | `""` |
| `extract_confidence` | number | Confidence score (0-1) | `0.75` |
| `warnings` | string | JSON array of warnings | `"[\"MISSING_TEXT\", \"CONTEXT_INFERRED\"]"` |

### 8. NCC Pathway & Status (3 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `ncc_pathway` | string | NCC compliance pathway | `"PERFORMANCE"`, `"DTS"`, `"VERIFICATION"`, `"OBJECTIVE"`, `"FUNCTIONAL"` |
| `normative_status` | string | Normative or informative | `"NORMATIVE"`, `"INFORMATIVE"` |
| `conditionality` | string | When this applies | `"ALWAYS"`, `"IF_DTS_SELECTED"`, `"IF_PERFORMANCE_SELECTED"` |

### 9. Context & Raw Data (3 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `heading_context` | string | Context heading | `"Objectives"`, `"Performance Requirements"` |
| `raw_title` | string | Original title before processing | `"E3P1 Buildings must resist fire spread."` |
| `raw_text` | string | Original text before processing | `"E3P1 Buildings must resist fire spread. The building..."` |

### 10. State Variations (4 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `applies_state` | string | State abbreviation (empty for national) | `""`, `"VIC"`, `"NSW"`, `"QLD"` |
| `variation_action` | string | Type of variation | `"DELETE"`, `"INSERT"`, `"REPLACE"`, `"NOT_APPLICABLE"`, `"AMEND_PART"` |
| `affected_unit_label` | string | Unit label this variation affects | `"B4P2"` |
| `affected_subparts` | string | Affected subparts | `"H1"` |
| `affects_anchor_id` | string | Anchor ID of affected unit | `"anchor_001"` |

### 11. Table & Structure Data (2 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `table_grid_json` | string | Table structure (JSON) | `"{\"headers\": [...], \"rows\": [[...]]}"` |
| `table_key_values` | string | Key-value pairs from table | `"CLASS=3\|MAX_TRAVEL=20 m"` |

### 12. State Variation Details (2 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `base_unit_label` | string | Base label from state variation | `"B4P2"` (from "VIC B4P2(2)") |
| `affected_subclause` | string | Subclause identifier | `"(2)(a)"` |

### 13. Extracted Phrases (4 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `conditions_text` | string | IF/WHERE/UNLESS phrases | `"IF building is Class 3 THEN..."` |
| `exceptions_text` | string | EXCEPT/DOES NOT APPLY phrases | `"EXCEPT Class 1 buildings"` |
| `requirements_list` | string | Pipe-separated "must"/"shall" sentences | `"must resist fire\|shall comply with AS 3000"` |
| `standards_referenced` | string | Pipe-separated AS/ISO references | `"AS 3000\|AS 3600\|ISO 9001"` |

### 14. Quality Flags (1 column)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `notes_quality` | string | QA flags (pipe-separated) | `"MISSING_TEXT\|TABLE_BLOB_ONLY"` |

### 15. Decision-Oriented Fields (7 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `discipline` | string | Engineering discipline | `"Electrical"`, `"Mechanical"`, `"Plumbing"`, `"Stormwater"`, `""` |
| `table_purpose` | string | Semantic purpose of table | `"Fire resistance periods"` |
| `table_id` | string | Table identifier | `"Table D2.1"` |
| `table_label` | string | Table label/caption | `"Table D2.1: Fire resistance periods"` |
| `applies_to_volume` | string | Volume this applies to | `"V1"`, `"V2"`, `"V3"`, `""` |
| `applies_to_class` | string | Building classes (pipe-separated) | `"1\|2\|3"` or `""` |
| `volume_hierarchy` | string | Hierarchy level | `"PRIMARY"`, `"SECONDARY"`, `"TERTIARY"` |
| `dataset_coverage` | string | Coverage information (JSON) | `"{\"parts\": [\"J1\", \"J2\"]}"` |

### 16. Advanced Decision Fields (5 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `scope_conditions` | string | IF/THEN/ELSE scope logic | `"IF building is Class 3 THEN applies_to_volume=V1"` |
| `formula_json` | string | Formula structure (JSON) | `"{\"formula\": \"A = L × W\", \"inputs\": [\"L\", \"W\"], \"output\": \"A\"}"` |
| `constant_value` | string | Numeric value with unit | `"2.4m"`, `"20m"` |
| `constant_name` | string | Constant name | `"MINIMUM_CEILING_HEIGHT"` |
| `pathway_alternative_to` | string | Alternative pathway | `"DTS"` |
| `verification_method_for` | string | Which PR this VM verifies | `"E3P1"` |

### 17. Identity Validation (2 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `section_code` | string | Section letter (A-J) | `"E"`, `"C"`, `"D"` |
| `part_code` | string | Part code (letter + number) | `"J7"`, `"D2"`, `"H1"` |

---

## Unit Types

The `unit_type` field can be one of **51 different types**:

### Structural Types (4)
- `VOLUME` - Volume heading (Volume One, Volume Two, Volume Three)
- `SECTION` - Section heading (Section A, Section B, etc.)
- `PART` - Part heading (Part H1, Part J7, etc.)
- `SUBPART` - Subpart heading

### Content Types (12)
- `HEADING` - Generic heading
- `INTRODUCTION` - Introduction section
- `INTRODUCTORY_PROVISION` - Introductory provisions
- `GOVERNING_REQUIREMENT` - Governing requirements (G-prefixed labels)
- `OBJECTIVE` - Objectives (O-prefixed labels)
- `FUNCTIONAL_STATEMENT` - Functional statements (F-prefixed labels)
- `PROVISION` - Generic provision
- `PERFORMANCE_REQUIREMENT` - Performance requirements (P-prefixed labels)
- `DTS_PROVISION` - Deemed-to-Satisfy provisions (D-prefixed labels)
- `VERIFICATION_METHOD` - Verification methods (V-prefixed labels)
- `DEFINITION` - Definition entries
- `APPLICATION` - Application clauses

### Special Content (4)
- `SPECIFICATION` - Specification sections
- `SPECIFICATION_CLAUSE` - Specification clauses
- `SCHEDULE` - Schedule sections
- `APPENDIX` - Appendix sections

### Supporting Content (3)
- `EXPLANATORY_INFORMATION` - Explanatory information
- `NOTE` - Notes
- `EXCEPTION` - Exception clauses

### State Variations (2)
- `STATE_VARIATION` - State-specific variations
- `STATE_VARIATION_AMENDMENT` - State variation amendments

### Assets (3)
- `TABLE` - Tables
- `TABLE_NOTE` - Table notes
- `FIGURE` - Figures/images

### Decision-Oriented Types (10)
- `SCOPE_SUMMARY` - Scope summary
- `SCOPE_VOLUME_SELECTION` - Volume selection rules
- `SCOPE_CLASS_APPLICABILITY` - Class applicability rules
- `SCOPE_EXCEPTION` - Scope exceptions
- `GOVERNANCE_RULE` - Governance rules
- `DISCIPLINE_RULE` - Discipline-specific rules
- `CONDITIONAL_RULE` - Conditional rules
- `PATHWAY_SELECTION` - Pathway selection rules
- `PATHWAY_COMPLETE` - Complete pathway rules
- `CALCULATION_RULE` - Calculation rules
- `SIZING_RULE` - Sizing rules
- `CONSTANT` - Constant values
- `PERFORMANCE_CRITERION` - Performance criteria
- `TABLE_ROW` - Individual table rows

### Other (1)
- `OTHER` - Unclassified content

---

## Processing Flow

### Step 1: Document Conversion
1. Read DOCX file
2. Convert DOCX to HTML using Mammoth.js
3. Extract plain text from HTML
4. Repair HTML formatting (fix broken tags, normalize structure)

### Step 2: HTML Parsing
1. Parse HTML using DOMParser
2. Extract all block-level elements (paragraphs, headings, tables, etc.)
3. Build paragraph index map
4. Identify document structure (sections, parts, subparts)

### Step 3: Unit Detection
1. **Detect Unit Labels**: Scan paragraphs for NCC-style labels (E3P1, C2D5, H1P1, etc.)
2. **Classify Unit Types**: Determine unit_type based on label pattern and context
3. **Extract Titles**: Extract title (first sentence/line after unit_label)
4. **Extract Text**: Extract full clause text
5. **Detect State Variations**: Identify state-specific variations (VIC, NSW, QLD, etc.)
6. **Detect Notes/Exceptions**: Identify NOTE and EXCEPTION markers

### Step 4: Hierarchy Building
1. Build path hierarchy (Volume > Section > Part > Clause)
2. Assign parent_anchor_id relationships
3. Calculate order_in_parent
4. Generate anchor_id for each row

### Step 5: Text Processing
1. Clean and normalize text
2. Extract defined terms
3. Detect "shall" and "must" occurrences
4. Extract external references (AS/ISO standards)
5. Extract internal references (other clause numbers)
6. Build rag_text (formatted for RAG systems)

### Step 6: Post-Processing Passes
1. **Identity Validation**: Derive section_code and part_code from path/unit_label
2. **State Variation Processing**: Extract base_unit_label, affected_subclause
3. **Phrase Extraction**: Extract conditions_text, exceptions_text, requirements_list
4. **Standards Extraction**: Extract standards_referenced
5. **Table Processing**: Extract table structure, key-values
6. **Scope Extraction**: Extract applies_to_volume, applies_to_class
7. **Discipline Detection**: Extract discipline from context
8. **Formula Extraction**: Extract formulas and constants

### Step 7: CSV Generation
1. Map all rows to CSV columns
2. Escape special characters
3. Handle boolean values (convert to "true"/"false")
4. Generate CSV header row
5. Write all data rows
6. Output to file

---

## Data Extraction Rules

### Unit Label Detection

**Patterns** (in order of priority):
1. `[A-Z]\d+[PDV]\d+[A-Z]?` - C2D5, C1P1, C2V1
2. `[A-Z]\d+[A-Z]\d+[A-Z]?` - E3D8, E3P1, A5G2
3. `[A-Z]{1,2}\d+[A-Z]{1,2}\d+[A-Z]?` - Broader pattern

**Examples**:
- `E3P1` → Performance Requirement
- `C2D5` → DTS Provision
- `H1P1` → Part H1, Provision 1
- `J7D4` → Part J7, DTS 4

### Title Extraction

**Rule**: Extract only the first sentence or first line after unit_label (not full clause text)

**Process**:
1. Remove unit_label from beginning of text
2. Remove leading separators (dash, colon, etc.)
3. Extract first sentence (ending with `.`, `!`, or `?`) if ≤ 150 characters
4. If no sentence end or too long, take first line (≤ 100 characters)
5. If first line too long, truncate at word boundary (around 100 chars)

**Example**:
- Input: `"E3P1 Buildings must resist fire spread. The building envelope..."`
- unit_label: `"E3P1"`
- title: `"Buildings must resist fire spread."`
- text: `"Buildings must resist fire spread. The building envelope..."`

### Unit Type Classification

**Based on Label Letter**:
- `G` → `GOVERNING_REQUIREMENT`
- `O` → `OBJECTIVE`
- `F` → `FUNCTIONAL_STATEMENT`
- `P` → `PERFORMANCE_REQUIREMENT`
- `D` → `DTS_PROVISION`
- `V` → `VERIFICATION_METHOD`

**Based on Context Heading**:
- "Objectives" → `OBJECTIVE`
- "Functional Statements" → `FUNCTIONAL_STATEMENT`
- "Performance Requirements" → `PERFORMANCE_REQUIREMENT`
- "Deemed-to-Satisfy Provisions" → `DTS_PROVISION`
- "Verification Methods" → `VERIFICATION_METHOD`

### Compliance Weight Assignment

**Rules**:
- `PERFORMANCE_REQUIREMENT` → `MANDATORY`
- `DTS_PROVISION` → `OPTIONAL_PATHWAY`
- `VERIFICATION_METHOD` → `OPTIONAL_PATHWAY`
- `OBJECTIVE` → `MANDATORY`
- `FUNCTIONAL_STATEMENT` → `MANDATORY`
- `NOTE`, `EXPLANATORY_INFORMATION` → `NON_MANDATORY`
- `EXCEPTION` → `NON_MANDATORY`

### State Variation Detection

**Patterns**:
- `^(SA|NSW|VIC|QLD|WA|TAS|ACT|NT)\s+([A-Z]\d+[A-Z]\d+)` - State prefix + label
- Example: `"VIC B4P2(2)"` → applies_state: `"VIC"`, base_unit_label: `"B4P2"`, affected_subclause: `"(2)"`

**Variation Actions**:
- `DELETE` - State deletes this clause
- `INSERT` - State inserts new clause
- `REPLACE` - State replaces clause
- `AMEND_PART` - State amends entire part

### Reference Detection

**External References**:
- Pattern: `AS\s+\d+`, `AS\/NZS\s+\d+`, `ISO\s+\d+`
- Example: `"AS 3000"`, `"AS/NZS 3600"`, `"ISO 9001"`

**Internal References**:
- Pattern: NCC-style labels (E3P1, C2D5, etc.)
- Example: `"E3P1"`, `"C2D5"`, `"H1P1"`

### Identity Validation

**section_code Extraction**:
- From path: `"Section H"` → `"H"`
- From unit_label: `"E3P1"` → `"E"` (first letter)
- From path parts: Extract section letter from hierarchical path

**part_code Extraction**:
- From path: `"Part H1"` → `"H1"`
- From unit_label: `"H1P1"` → `"H1"` (first letter + number)
- From path parts: Extract part code from hierarchical path

---

## Post-Processing Steps

### 1. Identity Validation Pass
- Derive `section_code` from `path` or `unit_label`
- Derive `part_code` from `path` or `unit_label`
- Set `indexable` = `false` for non-indexable rows (headings, structural elements)

### 2. State Variation Processing
- Extract `base_unit_label` from state variation text
- Extract `affected_subclause` from state variation text
- Link state variations to base units via `affects_anchor_id`

### 3. Phrase Extraction
- Extract `conditions_text` (IF/WHERE/UNLESS phrases)
- Extract `exceptions_text` (EXCEPT/DOES NOT APPLY phrases)
- Extract `requirements_list` (sentences with "must"/"shall")

### 4. Standards Extraction
- Extract `standards_referenced` (AS/ISO references)
- Format as pipe-separated list

### 5. Table Processing
- Extract `table_grid_json` (table structure as JSON)
- Extract `table_key_values` (key-value pairs from table cells)
- Populate `table_id`, `table_label`, `table_purpose`

### 6. Scope Extraction
- Extract `applies_to_volume` (V1, V2, V3)
- Extract `applies_to_class` (building classes)
- Build `scope_conditions` (IF/THEN logic)

### 7. Discipline Detection
- Extract `discipline` from context (Electrical, Mechanical, Plumbing, Stormwater)

### 8. Formula Extraction
- Extract `formula_json` (formula structure)
- Extract `constant_value` and `constant_name`

### 9. Quality Flags
- Set `notes_quality` flags (MISSING_TEXT, TABLE_BLOB_ONLY, etc.)
- Set `warnings` array for issues

---

## Field Value Enumerations

### ComplianceWeight
- `"MANDATORY"` - Must comply
- `"OPTIONAL_PATHWAY"` - Optional compliance pathway
- `"NON_MANDATORY"` - Informative only

### NccPathway
- `"PERFORMANCE"` - Performance pathway
- `"DTS"` - Deemed-to-Satisfy pathway
- `"VERIFICATION"` - Verification Method pathway
- `"OBJECTIVE"` - Objective level
- `"FUNCTIONAL"` - Functional Statement level

### NormativeStatus
- `"NORMATIVE"` - Legally binding
- `"INFORMATIVE"` - Informational only

### Conditionality
- `"ALWAYS"` - Always applies
- `"IF_DTS_SELECTED"` - Only if DTS pathway selected
- `"IF_PERFORMANCE_SELECTED"` - Only if Performance pathway selected

### VariationAction
- `"DELETE"` - State deletes this clause
- `"INSERT"` - State inserts new clause
- `"REPLACE"` - State replaces clause
- `"NOT_APPLICABLE"` - Not a state variation
- `"AMEND_PART"` - State amends entire part

### AssetType
- `"NONE"` - No asset
- `"IMAGE"` - Image/figure
- `"TABLE"` - Table

### Volume Values
- `"Volume One"` - Class 2-9 Buildings
- `"Volume Two"` - Class 1 & 10 Buildings
- `"Volume Three"` - Plumbing Code

### Applies To Volume
- `"V1"` - Volume One
- `"V2"` - Volume Two
- `"V3"` - Volume Three
- `""` - Not specified

### Volume Hierarchy
- `"PRIMARY"` - Primary volume
- `"SECONDARY"` - Secondary volume
- `"TERTIARY"` - Tertiary volume

### States
- `"SA"` - South Australia
- `"NSW"` - New South Wales
- `"VIC"` - Victoria
- `"QLD"` - Queensland
- `"WA"` - Western Australia
- `"TAS"` - Tasmania
- `"ACT"` - Australian Capital Territory
- `"NT"` - Northern Territory
- `""` - National (no state variation)

---

## CSV Formatting Rules

### Escaping
- Fields containing comma, quote, or newline must be wrapped in double quotes
- Double quotes within quoted fields must be escaped as `""`
- Boolean values written as `"true"` or `"false"` (lowercase strings)

### Empty Values
- Empty strings represented as empty field (no quotes)
- Null/undefined values represented as empty field
- Boolean `false` written as `"false"` (not empty)

### JSON Fields
- JSON arrays/objects stored as JSON strings
- Example: `"[\"AS 3000\", \"AS 3600\"]"`
- Must be properly escaped for CSV

### Pipe-Separated Fields
- Multiple values separated by pipe character `|`
- Example: `"1|2|3"` or `"AS 3000|AS 3600"`

---

## Expected Output Statistics

### Volume Two (Class 1 & 10 Buildings)
- **Rows**: ~4,500-5,000
- **File Size**: ~19-20 MB
- **Processing Time**: ~90 seconds

### Volume Three (Plumbing Code)
- **Rows**: ~5,000-6,000
- **File Size**: ~21-22 MB
- **Processing Time**: ~100 seconds

### Volume One (Class 2-9 Buildings)
- **Rows**: ~8,000-10,000
- **File Size**: ~35-40 MB
- **Processing Time**: ~150-200 seconds (requires 16GB+ memory)

---

## Quality Gates

### Required Checks
1. **No Empty rag_text**: All rows must have non-empty `rag_text`
2. **Valid anchor_ids**: All rows must have unique `anchor_id`
3. **Valid parent_anchor_ids**: Parent references must exist
4. **Valid unit_types**: All unit_types must be from allowed list
5. **Valid compliance_weights**: All compliance_weights must be from allowed list

### Warning Flags
- `MISSING_TEXT` - Row has empty text field
- `MISSING_TITLE` - Row has empty title field
- `CONTEXT_INFERRED` - Unit type inferred from label (context missing)
- `STATE_VARIATION_EMBEDDED` - State variation found embedded in text
- `TABLE_BLOB_ONLY` - Table extracted as blob only (no structure)

---

## Implementation Notes

### Key Functions
- `buildNccUnitsFromHtml()` - Main processing function
- `detectUnitLabelStart()` - Detects unit labels in text
- `classifyLabelStrict()` - Classifies unit type from label
- `rowsToNccUnitsCsv()` - Converts rows to CSV format
- `validateAndDeriveIdentity()` - Derives section_code and part_code

### Dependencies
- `mammoth` - DOCX to HTML conversion
- `linkedom` - HTML parsing (DOMParser)
- Custom `format-repair` - HTML repair and normalization
- Custom `identity-validator` - Identity validation

### Memory Considerations
- Volume One requires 16GB+ heap memory
- Use `NODE_OPTIONS='--max-old-space-size=16384'` for Volume One
- Use `NODE_OPTIONS='--max-old-space-size=8192'` for Volumes Two and Three

---

## End of Specification

This document provides the complete specification for NCC CSV generation. Use this as a reference when re-implementing the system.

