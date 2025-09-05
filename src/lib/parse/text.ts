import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { getFileExtension } from '../files/resumeFiles';

export async function extractTextFromPdf(bytes: Uint8Array): Promise<string> {
  try {
    const buffer = Buffer.from(bytes);
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (error) {
    console.error('PDF parsing error:', error);
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