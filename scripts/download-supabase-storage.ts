/**
 * Download all Supabase Storage objects from the source project to local disk.
 *
 * Required env (set in .env.local or your shell):
 *   CLONE_SOURCE_SUPABASE_URL
 *   CLONE_SOURCE_SERVICE_ROLE
 *
 * Flags:
 *   --out <dir>        Output directory (default: exports/storage-source-<timestamp>)
 *   --bucket <name>    Only download a single bucket
 *   --no-resume        Re-download even if a local file with matching size exists
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

config({ path: path.resolve(__dirname, '..', '.env.local') });

type StorageObjectInfo = {
  path: string;
  size?: number;
  contentType?: string;
  lastModified?: string;
};

type ListItem = {
  name: string;
  id?: string | null;
  metadata?: unknown;
  updated_at?: string | null;
};

type Options = {
  outDir: string;
  bucket?: string;
  resume: boolean;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function defaultOutDir(): string {
  const stamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+/, '');
  return path.join(__dirname, '..', 'exports', `storage-source-${stamp}`);
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    outDir: defaultOutDir(),
    resume: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' && argv[i + 1]) {
      options.outDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--out=')) {
      options.outDir = arg.slice('--out='.length);
      continue;
    }
    if (arg === '--bucket' && argv[i + 1]) {
      options.bucket = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--bucket=')) {
      options.bucket = arg.slice('--bucket='.length);
      continue;
    }
    if (arg === '--no-resume') {
      options.resume = false;
    }
    if (arg === '--resume') {
      options.resume = true;
    }
  }

  return options;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  return undefined;
}

function getMetaNumber(meta: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  if (!meta) return undefined;
  for (const key of keys) {
    if (key in meta) {
      const parsed = parseNumber(meta[key]);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

function getMetaString(meta: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!meta) return undefined;
  for (const key of keys) {
    if (key in meta) {
      const parsed = parseString(meta[key]);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

function normalizeStorageObject(pathValue: string, item: ListItem): StorageObjectInfo {
  const meta = asRecord(item.metadata);
  return {
    path: pathValue,
    size: getMetaNumber(meta, ['size', 'contentLength', 'content_length']),
    contentType: getMetaString(meta, ['mimetype', 'contentType', 'content_type']),
    lastModified: getMetaString(meta, ['lastModified', 'last_modified']) ?? item.updated_at ?? undefined,
  };
}

function toSafePath(root: string, objectPath: string): string {
  const normalized = path.posix.normalize(objectPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const segments = normalized.split('/').filter(segment => segment && segment !== '.' && segment !== '..');
  const fullPath = path.join(root, ...segments);

  const rootResolved = path.resolve(root);
  const fullResolved = path.resolve(fullPath);
  if (fullResolved !== rootResolved && !fullResolved.startsWith(rootResolved + path.sep)) {
    throw new Error(`Unsafe object path detected: ${objectPath}`);
  }

  return fullPath;
}

async function listAllObjects(
  supa: ReturnType<typeof createClient>,
  bucket: string,
): Promise<StorageObjectInfo[]> {
  const results: StorageObjectInfo[] = [];
  const queue: string[] = [''];

  while (queue.length) {
    const prefix = queue.shift()!;
    let offset = 0;

    while (true) {
      const { data, error } = await supa.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset,
      });
      if (error) {
        throw new Error(`List failed for bucket ${bucket}, prefix "${prefix}": ${error.message}`);
      }

      for (const item of (data ?? []) as ListItem[]) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (!item.id && !item.metadata) {
          queue.push(fullPath);
        } else {
          results.push(normalizeStorageObject(fullPath, item));
        }
      }

      if (!data || data.length < 1000) break;
      offset += 1000;
    }
  }

  return results;
}

async function writeBlobToFile(blob: Blob, destPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const readable = Readable.fromWeb(blob.stream());
    const writer = fs.createWriteStream(destPath);
    readable.on('error', reject);
    writer.on('error', reject);
    writer.on('finish', resolve);
    readable.pipe(writer);
  });
}

async function shouldSkipExisting(destPath: string, expectedSize?: number): Promise<boolean> {
  if (!expectedSize) return false;
  try {
    const stat = await fs.promises.stat(destPath);
    return stat.isFile() && stat.size === expectedSize;
  } catch {
    return false;
  }
}

async function downloadBucket(
  supa: ReturnType<typeof createClient>,
  bucket: string,
  outDir: string,
  resume: boolean,
) {
  const bucketDir = path.join(outDir, bucket);
  await fs.promises.mkdir(bucketDir, { recursive: true });

  const objects = await listAllObjects(supa, bucket);
  console.log(`Bucket "${bucket}": ${objects.length} object(s)`);

  let downloaded = 0;
  let skipped = 0;

  for (let i = 0; i < objects.length; i += 1) {
    const obj = objects[i];
    const localPath = toSafePath(bucketDir, obj.path);
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });

    if (resume && (await shouldSkipExisting(localPath, obj.size))) {
      skipped += 1;
      continue;
    }

    const { data, error } = await supa.storage.from(bucket).download(obj.path);
    if (error || !data) {
      throw new Error(`Download failed for ${bucket}/${obj.path}: ${error?.message}`);
    }

    await writeBlobToFile(data, localPath);
    downloaded += 1;

    if ((i + 1) % 100 === 0 || i + 1 === objects.length) {
      console.log(`  Progress: ${i + 1}/${objects.length} (downloaded ${downloaded}, skipped ${skipped})`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const srcUrl = requireEnv('CLONE_SOURCE_SUPABASE_URL');
  const srcKey = requireEnv('CLONE_SOURCE_SERVICE_ROLE');

  const supa = createClient(srcUrl, srcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-client-info': 'download-storage-script' } },
  });

  await fs.promises.mkdir(options.outDir, { recursive: true });
  console.log(`Output directory: ${options.outDir}`);

  const { data: buckets, error } = await supa.storage.listBuckets();
  if (error) {
    throw new Error(`Storage list failed: ${error.message}`);
  }

  const filteredBuckets = options.bucket
    ? buckets.filter(bucket => bucket.name === options.bucket)
    : buckets;

  if (options.bucket && filteredBuckets.length === 0) {
    throw new Error(`Bucket not found: ${options.bucket}`);
  }

  console.log(`Buckets: ${filteredBuckets.map(bucket => bucket.name).join(', ') || '(none)'}`);

  for (const bucket of filteredBuckets) {
    await downloadBucket(supa, bucket.name, options.outDir, options.resume);
  }

  console.log('Storage download complete.');
}

main().catch(err => {
  console.error('Storage download failed:', err.message);
  process.exitCode = 1;
});
