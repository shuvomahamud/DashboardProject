import * as mammoth from 'mammoth';
import { getFileExtension } from '../files/resumeFiles';

// Safe PDF parser import with fallback
let pdfParse: any = null;
let pdfParseError: Error | null = null;

try {
  pdfParse = require('pdf-parse');
} catch (error) {
  pdfParseError = error instanceof Error ? error : new Error('Failed to load pdf-parse library');
  console.error('Failed to load pdf-parse library:', pdfParseError.message);
}

export async function extractTextFromPdf(bytes: Uint8Array): Promise<string> {
  // Check if pdf-parse library loaded successfully
  if (!pdfParse || pdfParseError) {
    console.warn('PDF parsing unavailable due to library loading error:', pdfParseError?.message || 'Unknown error');
    throw new Error('PDF text extraction is currently unavailable');
  }

  try {
    const buffer = Buffer.from(bytes);
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (error) {
    console.error('PDF parsing error:', error);

    // Handle specific pdf-parse library test file errors
    if (error instanceof Error && error.message.includes('05-versions-space.pdf')) {
      console.warn('PDF parsing failed due to library test file reference - returning empty text');
      return '';
    }

    // Handle file not found errors from test files
    if (error instanceof Error && error.message.includes('ENOENT') && error.message.includes('test/data')) {
      console.warn('PDF parsing failed due to library test file reference - returning empty text');
      return '';
    }

    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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