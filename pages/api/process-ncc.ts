/**
 * API endpoint for processing NCC DOCX files
 * 
 * Accepts multipart form upload with:
 * - file: NCC DOCX file
 * - volume: "Volume One" | "Volume Two" | "Volume Three"
 * - docId: Document identifier (e.g., "ncc2022")
 * - versionDate: Version year (e.g., "2022")
 * 
 * Returns:
 * - csvData: Complete CSV string
 * - filename: Suggested filename for download
 * - stats: Extraction statistics
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import formidable, { File as FormidableFile } from 'formidable';
import fs from 'fs';
import mammoth from 'mammoth';
import { DOMParser } from 'linkedom';

// Increase timeout for large file processing
export const config = {
  api: {
    bodyParser: false,
    responseLimit: '50mb',
  },
};

type NCCResult = {
  csvData: string;
  filename: string;
  stats: {
    totalUnits: number;
    unitTypes: Record<string, number>;
    stateVariations: number;
    fileSizeMB: number;
  };
};

type ErrorResponse = {
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<NCCResult | ErrorResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Provide DOMParser globally for lib/ncc-units.ts
    (globalThis as any).DOMParser = DOMParser;

    // Parse multipart form data
    const form = formidable({
      maxFileSize: 20 * 1024 * 1024, // 20MB limit
      keepExtensions: true,
    });

    const [fields, files] = await new Promise<[formidable.Fields, formidable.Files]>(
      (resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          else resolve([fields, files]);
        });
      }
    );

    // Extract form data
    const fileArray = files.file as FormidableFile[];
    const file = fileArray?.[0];
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const volume = Array.isArray(fields.volume) ? fields.volume[0] : fields.volume || 'Volume Two';
    const docId = Array.isArray(fields.docId) ? fields.docId[0] : fields.docId || 'ncc2022';
    const versionDate = Array.isArray(fields.versionDate) ? fields.versionDate[0] : fields.versionDate || '2022';

    // Validate file type
    if (!file.originalFilename?.endsWith('.docx')) {
      return res.status(400).json({ error: 'Only .docx files are supported' });
    }

    console.log(`[NCC API] Processing: ${file.originalFilename} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`[NCC API] Volume: ${volume}, Doc ID: ${docId}, Version: ${versionDate}`);

    // Read file buffer
    const buffer = fs.readFileSync(file.filepath);

    // Convert DOCX to HTML using Mammoth
    console.log('[NCC API] Converting DOCX to HTML...');
    const mammothResult = await mammoth.convertToHtml(
      { buffer },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Heading 5'] => h5:fresh",
          "p[style-name='Heading 6'] => h6:fresh",
        ],
      }
    );

    const htmlRaw = mammothResult.value;
    const textRaw = mammothResult.value
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`[NCC API] HTML length: ${(htmlRaw.length / 1024 / 1024).toFixed(2)} MB`);

    // Import processing modules (dynamic import to ensure DOMParser is set)
    const { repairFormat } = await import('@/lib/format-repair');
    const { buildNccUnitsFromHtml, rowsToNccUnitsCsv } = await import('@/lib/ncc-units');

    // Repair HTML format
    console.log('[NCC API] Repairing HTML format...');
    const { html_clean } = await repairFormat(htmlRaw, textRaw);

    // Build NCC units
    console.log('[NCC API] Building NCC units from HTML...');
    const { rows, warnings } = await buildNccUnitsFromHtml(html_clean, {
      doc_id: docId,
      volume: volume,
      state_variation: '',
      version_date: versionDate,
      source_file: file.originalFilename || 'uploaded.docx',
    });

    console.log(`[NCC API] Extracted ${rows.length} NCC units`);

    // Calculate statistics
    const unitTypes: Record<string, number> = {};
    let stateVariationCount = 0;

    rows.forEach(row => {
      const type = row.unit_type || 'UNKNOWN';
      unitTypes[type] = (unitTypes[type] || 0) + 1;
      
      if (type === 'STATE_VARIATION' || type === 'STATE_VARIATION_AMENDMENT') {
        stateVariationCount++;
      }
    });

    // Generate CSV
    console.log('[NCC API] Generating CSV...');
    const csvData = rowsToNccUnitsCsv(rows);
    const csvSizeMB = Buffer.byteLength(csvData, 'utf8') / 1024 / 1024;

    // Generate filename
    const volumeSlug = volume.toLowerCase().replace(/\s+/g, '_');
    const filename = `ncc_${docId}_${volumeSlug}.csv`;

    console.log(`[NCC API] ✅ Success: ${rows.length} units, ${csvSizeMB.toFixed(2)} MB CSV`);

    // Cleanup temp file
    try {
      fs.unlinkSync(file.filepath);
    } catch (err) {
      console.warn('[NCC API] Failed to delete temp file:', err);
    }

    // Return result
    return res.status(200).json({
      csvData,
      filename,
      stats: {
        totalUnits: rows.length,
        unitTypes,
        stateVariations: stateVariationCount,
        fileSizeMB: csvSizeMB,
      },
    });

  } catch (error: any) {
    console.error('[NCC API] Error:', error.message);
    console.error(error.stack);
    
    return res.status(500).json({
      error: error.message || 'An error occurred during processing',
    });
  }
}
