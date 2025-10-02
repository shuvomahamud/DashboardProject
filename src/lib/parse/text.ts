import * as mammoth from 'mammoth';
import { getFileExtension } from '../files/resumeFiles';
import { extractPdfText, hasValidText } from './pdf-extractor';

/**
 * Extract text from PDF using pure JavaScript pdfjs-dist
 * Works in Vercel Node.js runtime without native dependencies
 */
export async function extractTextFromPdf(bytes: Uint8Array): Promise<string> {
  const buffer = Buffer.from(bytes);

  // Extract with configurable timeout and page cap
  const maxPages = parseInt(process.env.PDF_HARD_PAGE_CAP || '15', 10);
  const timeoutMs = parseInt(process.env.PDF_EXTRACTION_TIMEOUT_MS || '3000', 10);

  const result = await extractPdfText(buffer, {
    maxPages,
    timeoutMs,
  });

  // Handle errors
  if (result.error) {
    if (result.error === 'SCANNED_PDF_NO_TEXT_LAYER') {
      console.warn('PDF has no text layer (likely scanned)');
      throw new Error('SCANNED_PDF_NO_TEXT_LAYER');
    }

    if (result.error === 'PDF_EXTRACTION_TIMEOUT') {
      console.warn('PDF extraction timeout');
      throw new Error('PDF_EXTRACTION_TIMEOUT');
    }

    console.error('PDF extraction error:', result.error);
    throw new Error(result.error);
  }

  // Validate text quality
  if (!hasValidText(result.text, 50)) {
    console.warn('PDF extracted but text appears empty or invalid');
    throw new Error('PDF_TEXT_TOO_SHORT');
  }

  return result.text;
}

export async function extractTextFromDocx(bytes: Uint8Array): Promise<string> {
  try {
    const buffer = Buffer.from(bytes);
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch (error) {
    console.error('DOCX parsing error:', error);
    throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function extractText(
  bytes: Uint8Array,
  filename: string,
  mime?: string
): Promise<string> {
  const ext = getFileExtension(filename);
  
  switch (ext) {
    case 'pdf':
      return extractTextFromPdf(bytes);
    case 'docx':
      return extractTextFromDocx(bytes);
    case 'doc':
      // Legacy .doc format is not supported
      return 'UNSUPPORTED_DOC_LEGACY';
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}