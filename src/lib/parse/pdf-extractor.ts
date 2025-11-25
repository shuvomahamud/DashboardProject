/**
 * Pure JavaScript PDF text extraction using pdfjs-dist
 * Works in Vercel Node.js runtime without native dependencies
 */

// CRITICAL: Load polyfills BEFORE importing pdfjs-dist
import './pdf-polyfills';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import path from 'path';
import { existsSync } from 'fs';

const require = createRequire(import.meta.url);

try {
  require('@napi-rs/canvas');
} catch (error) {
  console.warn('[pdf-extractor] @napi-rs/canvas not available; continuing with polyfills only');
}

let workerConfigured = false;
let resolvedWorkerSrc: string | null = null;

function configurePdfWorker() {
  if (workerConfigured && resolvedWorkerSrc) {
    return;
  }

  const publicWorkerPath = path.resolve(process.cwd(), 'public', 'pdf.worker.mjs');
  if (existsSync(publicWorkerPath)) {
    resolvedWorkerSrc = pathToFileURL(publicWorkerPath).href;
  }

  if (!resolvedWorkerSrc) {
    const moduleCandidates = [
      'pdfjs-dist/legacy/build/pdf.worker.mjs',
      'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      'pdfjs-dist/build/pdf.worker.js',
    ];

    for (const moduleId of moduleCandidates) {
      try {
        const resolvedPath = require.resolve(moduleId);
        if (resolvedPath) {
          resolvedWorkerSrc = pathToFileURL(resolvedPath).href;
          break;
        }
      } catch {
        // continue to next candidate
      }
    }
  }

  if (!resolvedWorkerSrc) {
    throw new Error('Failed to locate pdfjs worker script. Ensure pdfjs-dist is installed.');
  }

  if (typeof (pdfjsLib as any).GlobalWorkerOptions !== 'undefined') {
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = resolvedWorkerSrc;
  }

  workerConfigured = true;
}

export interface PdfExtractionOptions {
  maxPages?: number;      // Hard cap on pages to extract (default: 15)
  timeoutMs?: number;     // Timeout for extraction (default: 3000ms)
}

export interface PdfExtractionResult {
  text: string;
  pages: number;
  error?: string;
}

/**
 * Extract text from PDF buffer
 *
 * Only works with digital PDFs that have a text layer.
 * Scanned PDFs without OCR will return empty text.
 */
export async function extractPdfText(
  buffer: Buffer | Uint8Array,
  options: PdfExtractionOptions = {}
): Promise<PdfExtractionResult> {
  const {
    maxPages = 15,
    timeoutMs = 3000,
  } = options;

  const startTime = Date.now();
  let pdfDoc: any = null;

  try {
    configurePdfWorker();

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: buffer instanceof Buffer ? new Uint8Array(buffer) : buffer,
      useSystemFonts: true,
      isEvalSupported: false,
      useWorkerFetch: false,
      verbosity: 0, // Suppress warnings
      // CRITICAL: Disable worker in serverless environment to avoid module resolution errors
      disableWorker: true,
      isOffscreenCanvasSupported: false,
    });

    pdfDoc = await Promise.race([
      loadingTask.promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PDF loading timeout')), timeoutMs)
      ),
    ]);

    const totalPages = pdfDoc.numPages;
    const pagesToExtract = Math.min(totalPages, maxPages);
    const textChunks: string[] = [];

    // Extract text from each page
    for (let pageNum = 1; pageNum <= pagesToExtract; pageNum++) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        console.warn(`PDF extraction timeout after ${pageNum - 1} pages`);
        break;
      }

      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Join text items with spaces
      const pageText = textContent.items
        .map((item: any) => {
          if (typeof item.str === 'string') {
            return item.str;
          }
          return '';
        })
        .join(' ')
        .replace(/\u00AD/g, '')       // Remove soft hyphens
        .replace(/[ \t]+/g, ' ')      // Collapse whitespace
        .trim();

      if (pageText.length > 0) {
        textChunks.push(pageText);
      }

      // Clean up page resources
      await page.cleanup();
    }

    const fullText = textChunks.join('\n\n').trim();

    // Check if we got any text (detect scanned PDFs)
    if (fullText.length === 0 && totalPages > 0) {
      return {
        text: '',
        pages: pagesToExtract,
        error: 'SCANNED_PDF_NO_TEXT_LAYER',
      };
    }

    return {
      text: fullText,
      pages: pagesToExtract,
    };

  } catch (error: any) {
    console.error('PDF extraction error:', error);

    // Categorize errors
    if (error.message?.includes('timeout')) {
      return {
        text: '',
        pages: 0,
        error: 'PDF_EXTRACTION_TIMEOUT',
      };
    }

    if (error.message?.includes('pdfjs worker script') || error.message?.includes('GlobalWorkerOptions.workerSrc')) {
      return {
        text: '',
        pages: 0,
        error: 'PDF_WORKER_MISSING',
      };
    }

    if (error.message?.includes('Invalid PDF') || error.message?.includes('corrupted')) {
      return {
        text: '',
        pages: 0,
        error: 'MALFORMED_PDF',
      };
    }

    if (error.message?.includes('password') || error.message?.includes('encrypted')) {
      return {
        text: '',
        pages: 0,
        error: 'ENCRYPTED_PDF',
      };
    }

    return {
      text: '',
      pages: 0,
      error: `PDF_ERROR: ${error.message}`,
    };

  } finally {
    // Clean up resources
    if (pdfDoc) {
      try {
        await pdfDoc.destroy();
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Validate if extracted text is meaningful
 * Returns false for empty or near-empty results
 */
export function hasValidText(text: string, minLength: number = 50): boolean {
  if (!text || text.length < minLength) {
    return false;
  }

  // Check if text has reasonable word count
  const words = text.split(/\s+/).filter(w => w.length > 0);
  return words.length >= 10;
}
