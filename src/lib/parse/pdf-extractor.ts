/**
 * Pure JavaScript PDF text extraction using pdfjs-dist
 * Works in Vercel Node.js runtime without native dependencies
 */

// Polyfill browser APIs that pdfjs-dist expects in Node.js
if (typeof window === 'undefined') {
  // @ts-ignore - DOMMatrix polyfill for coordinate transforms
  globalThis.DOMMatrix = class DOMMatrix {
    a: number; b: number; c: number; d: number; e: number; f: number;

    constructor(init?: any) {
      this.a = 1; this.b = 0; this.c = 0;
      this.d = 1; this.e = 0; this.f = 0;
    }

    translate(tx: number, ty: number) { return this; }
    scale(sx: number, sy?: number) { return this; }
    rotate(angle: number) { return this; }
    multiply(other: any) { return this; }
    inverse() { return this; }
    transformPoint(point: any) { return point; }
  };

  // @ts-ignore - Path2D polyfill (minimal, pdfjs might use for rendering)
  globalThis.Path2D = class Path2D {
    constructor(path?: any) {}
    addPath(path: any) {}
    closePath() {}
    moveTo(x: number, y: number) {}
    lineTo(x: number, y: number) {}
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {}
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {}
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean) {}
    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number) {}
    ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise?: boolean) {}
    rect(x: number, y: number, w: number, h: number) {}
  };
}

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

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
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: buffer instanceof Buffer ? new Uint8Array(buffer) : buffer,
      useSystemFonts: true,
      isEvalSupported: false,
      useWorkerFetch: false,
      verbosity: 0, // Suppress warnings
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
