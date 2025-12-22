/**
 * API Endpoint: POST /api/upload-docx
 * 
 * Handles DOCX file upload and conversion to HTML/text
 * 
 * Process:
 * 1. Receives .docx file via multipart/form-data
 * 2. Converts to HTML using Mammoth
 * 3. Applies format repair pipeline
 * 4. Returns cleaned HTML, text, and paragraphs
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import mammoth from 'mammoth';
import { repairFormat } from '@/lib/format-repair';
import { UploadResponse } from '@/types';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false, // Disable body parser, we'll use formidable
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UploadResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  try {
    // Parse the incoming form data
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const fileArray = files.file;
    
    if (!fileArray || fileArray.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const file = fileArray[0];
    
    // Check if it's a .doc file (older format - not supported by Mammoth)
    const isDocFile = file.originalFilename?.toLowerCase().endsWith('.doc') ||
                     file.mimetype === 'application/msword';
    
    if (isDocFile) {
      // Clean up uploaded file
      if (file.filepath) {
        fs.unlinkSync(file.filepath);
      }
      return res.status(400).json({
        success: false,
        error: '.doc files are not supported. Please convert your .doc file to .docx format. You can do this by opening it in Microsoft Word and saving as .docx, or using an online converter.',
      });
    }
    
    // Validate .docx file type
    const isDocxFile = file.originalFilename?.toLowerCase().endsWith('.docx') ||
                       file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    
    if (!isDocxFile) {
      // Clean up uploaded file
      if (file.filepath) {
        fs.unlinkSync(file.filepath);
      }
      return res.status(400).json({
        success: false,
        error: 'Only .docx files are supported. Please upload a .docx file.',
      });
    }

    // Read file buffer
    const buffer = fs.readFileSync(file.filepath);
    
    // Clean up uploaded file
    fs.unlinkSync(file.filepath);
    
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

    // Extract raw paragraphs (before cleanup)
    const paragraphsRaw = htmlRaw
      .replace(/<[^>]+>/g, '\n')
      .split(/\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // Apply format repair pipeline
    console.log('[API] Repairing HTML format...');
    const { html_clean, text_clean, paragraphs_clean } = await repairFormat(
      htmlRaw,
      textRaw
    );
    console.log(`[API] HTML conversion complete: ${html_clean.length} characters, ${paragraphs_clean.length} paragraphs`);

    // Debug logging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Upload] Raw paragraphs count:', paragraphsRaw.length);
      console.log('[Upload] Clean paragraphs count:', paragraphs_clean.length);
    }

    // Return html_clean and paragraphs_clean (required by Word Processor for clause detection)
    // Note: Reduces response from ~4MB to ~2.5MB by excluding html_raw, text_raw, text_clean, paragraphs_raw
    return res.status(200).json({
      success: true,
      data: {
        html_clean,
        paragraphs_clean, // Required by WordProcessor.tsx for clause detection (line 86, 90)
      },
    });
  } catch (error: any) {
    console.error('Error processing DOCX:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process DOCX file',
    });
  }
}

