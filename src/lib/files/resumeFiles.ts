import { createHash } from 'crypto';

export const ALLOWED_EXT = ['pdf', 'doc', 'docx'] as const;
export type AllowedExtension = typeof ALLOWED_EXT[number];

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] as const;

export function isSupported(name: string, mime?: string): boolean {
  // Check by file extension
  const ext = name.toLowerCase().split('.').pop();
  const hasValidExt = ext && ALLOWED_EXT.includes(ext as AllowedExtension);
  
  // Check by MIME type if provided
  const hasValidMime = mime ? ALLOWED_MIME_TYPES.includes(mime as any) : true;
  
  return Boolean(hasValidExt && hasValidMime);
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = createHash('sha256');
  hash.update(bytes);
  return hash.digest('hex');
}

export function safeFilename(name: string): string {
  // Replace spaces with underscores and remove unsafe characters
  return name
    .replace(/[^\w\s.-]/g, '') // Keep alphanumeric, spaces, dots, hyphens
    .replace(/\s+/g, '_')      // Replace spaces with underscores
    .replace(/_{2,}/g, '_')    // Replace multiple underscores with single
    .replace(/^_+|_+$/g, '')   // Remove leading/trailing underscores
    .toLowerCase();
}

interface ObjectPathParams {
  jobId?: number;
  hash: string;
  name: string;
  source: 'email' | 'cloud';
}

export function objectPath(params: ObjectPathParams): string {
  const { jobId, hash, name, source } = params;
  const safeName = safeFilename(name);
  const filename = `${hash}-${safeName}`;
  
  if (jobId) {
    return `jobs/${jobId}/${filename}`;
  }
  
  return `imports/${filename}`;
}

export function getFileExtension(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  return ext || '';
}

export function inferContentType(filename: string): string {
  const ext = getFileExtension(filename);
  
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return 'application/octet-stream';
  }
}