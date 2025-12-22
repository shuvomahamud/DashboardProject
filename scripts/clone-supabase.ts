/**
 * Clone a Supabase project (Postgres + optionally Storage) from source to destination.
 * - Verifies connectivity first.
 * - Dumps schema+data from source using `npx supabase db dump` (uses INSERTs by default).
 * - Wipes destination schemas (safe list preserved) and applies the dump.
 * - Optionally copies all storage buckets/objects.
 *
 * Required env (set in .env.local or your shell):
 *   CLONE_SOURCE_DATABASE_URL
 *   CLONE_DEST_DATABASE_URL
 *   CLONE_SOURCE_SUPABASE_URL
 *   CLONE_DEST_SUPABASE_URL
 *   CLONE_SOURCE_SERVICE_ROLE
 *   CLONE_DEST_SERVICE_ROLE
 *
 * Flags:
 *   --verify           Only check connectivity (DB + storage) and exit.
 *   --yes              Actually run the clone (defaults to verify-only without this).
 *   --with-storage     Copy storage buckets/objects too.
 *   --storage-refresh  Delete destination objects that match source paths, then re-upload.
 *                      Re-run with the same flags to resume uploads if interrupted.
 *   --skip-db          Skip database clone (useful with --with-storage).
 *   --skip-wipe        Do not drop schemas on destination (not recommended).
 *   --resume           Resume managed data restore if public data already exists.
 */

import { config } from 'dotenv';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

config({ path: path.resolve(__dirname, '..', '.env.local') });

type Flags = {
  verifyOnly: boolean;
  yes: boolean;
  withStorage: boolean;
  storageRefresh: boolean;
  skipDb: boolean;
  skipWipe: boolean;
  resume: boolean;
};

type StorageObjectInfo = {
  path: string;
  size?: number;
  contentType?: string;
  etag?: string;
  cacheControl?: string;
  lastModified?: string;
};

type StorageRefreshState = {
  srcUrl: string;
  destUrl: string;
  buckets: string[];
  phase: 'pending' | 'uploading';
  startedAt: string;
};

type BucketSnapshot = {
  bucket: { name: string; public: boolean };
  srcObjects: StorageObjectInfo[];
  destObjects: StorageObjectInfo[];
  extraCount: number;
};

const protectedSchemas = new Set<string>([
  'pg_catalog',
  'information_schema',
  'pg_toast',
  'pg_temp_1',
  'pg_toast_temp_1',
  'pgbouncer',
  'extensions',
  'graphql',
  'graphql_public',
  'realtime',
  'supabase_functions',
  'pg_stat_statements',
  'auth',
  'storage',
  'vault',
]);

const managedDataSchemas = [
  'auth',
  'storage',
  'realtime',
  'graphql',
  'graphql_public',
  'vault',
  'pgbouncer',
  'supabase_functions',
];

const RETRY_LIMIT = 3;
const RETRY_BASE_MS = 1500;
const CACHE_ROOT = path.join(__dirname, '..', '.cache', 'supabase-clone');
const MANAGED_DUMP_NAME = 'managed-data.sql';
const STORAGE_REFRESH_STATE_PATH = path.join(CACHE_ROOT, 'storage-refresh.json');

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { code?: string; message?: string };
  const code = anyErr.code ?? '';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'].includes(code)) {
    return true;
  }
  const msg = (anyErr.message ?? '').toLowerCase();
  return (
    msg.includes('getaddrinfo') ||
    msg.includes('enotfound') ||
    msg.includes('eai_again') ||
    msg.includes('etimedout') ||
    msg.includes('enetwork')
  );
}

async function withRetries<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryableError(err) || attempt >= RETRY_LIMIT) {
        throw err;
      }
      const waitMs = RETRY_BASE_MS * Math.pow(2, attempt);
      console.warn(`Transient error (${label}). Retrying in ${waitMs}ms...`);
      await sleep(waitMs);
      attempt += 1;
    }
  }
}

async function withStorageRetries<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= RETRY_LIMIT) {
        throw err;
      }
      const waitMs = RETRY_BASE_MS * Math.pow(2, attempt);
      console.warn(`Storage error (${label}). Retrying in ${waitMs}ms...`);
      await sleep(waitMs);
      attempt += 1;
    }
  }
}

function formatStorageError(err: unknown): string {
  if (!err) return 'unknown error';
  if (typeof err === 'string') return err;
  const anyErr = err as { message?: string };
  if (anyErr.message) return anyErr.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function withPgClient<T>(
  url: string,
  label: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  return withRetries(async () => {
    const client = new Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }, label);
}

function shouldSkipDumpLine(line: string): boolean {
  const lower = line.toLowerCase();
  if (lower.includes('pgsodium')) return true;
  if (lower.startsWith('insert into auth.schema_migrations')) return true;
  if (lower.startsWith('insert into storage.buckets_vectors')) return true;
  if (lower.startsWith('insert into storage.migrations')) return true;
  if (lower.startsWith('insert into storage.vector_indexes')) return true;
  if (lower.includes('setval(')) {
    for (const schema of managedDataSchemas) {
      if (lower.includes(`'${schema}.`)) {
        return true;
      }
    }
  }
  return false;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    verifyOnly: false,
    yes: false,
    withStorage: false,
    storageRefresh: false,
    skipDb: false,
    skipWipe: false,
    resume: false,
  };

  for (const arg of argv) {
    if (arg === '--verify') flags.verifyOnly = true;
    if (arg === '--yes' || arg === '-y') flags.yes = true;
    if (arg === '--with-storage') flags.withStorage = true;
    if (arg === '--storage-refresh') flags.storageRefresh = true;
    if (arg === '--skip-db') flags.skipDb = true;
    if (arg === '--skip-wipe') flags.skipWipe = true;
    if (arg === '--resume') flags.resume = true;
  }

  return flags;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    const user = u.username ? `${u.username}@` : '';
    return `${u.protocol}//${user}${u.host}${u.pathname}`;
  } catch {
    return '<invalid url>';
  }
}

async function checkDbConnection(url: string, label: string) {
  await withPgClient(url, `DB ${label}`, async client => {
    const res = await client.query(
      `select current_database() as db, current_user as user, inet_client_addr() as client_addr`,
    );
    const row = res.rows[0];
    console.log(
      `✔ DB ok (${label}): db=${row.db}, user=${row.user}, addr=${row.client_addr ?? 'n/a'}`,
    );
  });
}

async function listBuckets(
  url: string,
  serviceRole: string,
  label: string,
): Promise<{ name: string; public: boolean }[]> {
  const supa = createSupabaseClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-client-info': 'clone-supabase-script' } },
  });

  const { data, error } = await supa.storage.listBuckets();
  if (error) {
    throw new Error(`Storage list failed (${label}): ${error.message}`);
  }

  console.log(`✔ Storage ok (${label}): ${data.length} bucket(s) visible`);
  return data.map(b => ({ name: b.name, public: Boolean(b.public) }));
}

function runSupabaseDump(srcUrl: string, dumpPath: string): Promise<void> {
  const excludedSchemas = [...managedDataSchemas, 'extensions', 'pgsodium'];
  const commonArgs = [
    `--dbname=${srcUrl}`,
    '--format=plain',
    '--encoding=UTF8',
    '--no-owner',
    '--no-privileges',
    '--inserts',
  ];

  const pgDump = resolvePgBinary('pg_dump');
  if (pgDump) {
    console.log(`Dumping source DB to ${dumpPath} via pg_dump ...`);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-dump-'));
    const mainDump = path.join(tmpDir, 'main.sql');
    const managedDataDump = path.join(tmpDir, 'managed-data.sql');

    const excludeArgs = excludedSchemas.flatMap(s => ['--exclude-schema', s]);
    const dataOnlyArgs = managedDataSchemas.flatMap(s => ['--schema', s]);

    return spawnAndWait(pgDump, [...commonArgs, ...excludeArgs, `--file=${mainDump}`])
      .then(() =>
        spawnAndWait(pgDump, [...commonArgs, '--data-only', ...dataOnlyArgs, `--file=${managedDataDump}`]),
      )
      .then(async () => {
        await fs.promises.writeFile(dumpPath, `-- Clone dump\n`, 'utf8');
        await appendFilteredWithoutPgsodium(mainDump, dumpPath, 'a');
        await fs.promises.appendFile(
          dumpPath,
          `\n\n-- Managed schemas data-only (auth/storage/etc)\n`,
          'utf8',
        );
        await appendFilteredWithoutPgsodium(managedDataDump, dumpPath, 'a');
      })
      .finally(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      });
  }

  console.log(`Dumping source DB to ${dumpPath} via Supabase CLI ...`);
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return new Promise((resolve, reject) => {
    const child = spawn(
      npxBin,
      [
        '--yes',
        'supabase',
        'db',
        'dump',
        '--db-url',
        srcUrl,
        '--file',
        dumpPath,
        '--use-copy=false', // enforce INSERT statements to keep restore simple
      ],
      {
        stdio: 'inherit',
        shell: process.platform === 'win32',
      },
    );
    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`supabase db dump exited with code ${code}`));
      }
    });
    child.on('error', err => reject(err));
  });
}

function resolvePgBinary(binary: 'pg_dump' | 'psql'): string | null {
  const ext = process.platform === 'win32' ? '.exe' : '';

  const candidates: string[] = [];
  if (process.env.PG_DUMP_PATH && binary === 'pg_dump') {
    candidates.push(process.env.PG_DUMP_PATH);
  }
  if (process.env.PG_PSQL_PATH && binary === 'psql') {
    candidates.push(process.env.PG_PSQL_PATH);
  }
  if (process.env.PG_BIN_DIR) {
    candidates.push(path.join(process.env.PG_BIN_DIR, `${binary}${ext}`));
  }

  // local cached binaries
  candidates.push(
    path.join(__dirname, '..', '.cache', 'postgres-bin', 'pgsql', 'bin', `${binary}${ext}`),
  );

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function spawnAndWait(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', code => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} exited with code ${code}`));
    });
    child.on('error', err => reject(err));
  });
}

async function appendFilteredWithoutPgsodium(
  src: string,
  dest: string,
  mode: 'a' | 'w' = 'a',
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const reader = fs.createReadStream(src, { encoding: 'utf8' });
    const writer = fs.createWriteStream(dest, { encoding: 'utf8', flags: mode });

    let skipStatement = false;
    let buf = '';
    reader.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (skipStatement) {
          if (lower.includes(';')) {
            skipStatement = false;
          }
          continue;
        }
        if (
          lower.startsWith('create event trigger issue_') ||
          lower.startsWith('create event trigger "issue_')
        ) {
          if (!lower.includes(';')) {
            skipStatement = true;
          }
          continue;
        }
        if (shouldSkipDumpLine(line)) continue;
        writer.write(line + '\n');
      }
    });

    reader.on('end', () => {
      if (buf) {
        const lower = buf.toLowerCase();
        if (
          skipStatement ||
          lower.startsWith('create event trigger issue_') ||
          lower.startsWith('create event trigger "issue_')
        ) {
          // Skip any trailing line if we are inside the blocked statement.
        } else if (!shouldSkipDumpLine(buf)) {
          writer.write(buf + '\n');
        }
      }
      writer.end();
    });

    reader.on('error', reject);
    writer.on('error', reject);
    writer.on('finish', resolve);
  });
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

function normalizeStorageObject(pathValue: string, item: { metadata?: unknown; updated_at?: string }): StorageObjectInfo {
  const meta = asRecord(item.metadata);
  return {
    path: pathValue,
    size: getMetaNumber(meta, ['size', 'contentLength', 'content_length']),
    contentType: getMetaString(meta, ['mimetype', 'contentType', 'content_type']),
    etag: getMetaString(meta, ['eTag', 'etag']),
    cacheControl: getMetaString(meta, ['cacheControl', 'cache_control']),
    lastModified: getMetaString(meta, ['lastModified', 'last_modified']) ?? item.updated_at ?? undefined,
  };
}

function isMatchingObject(source: StorageObjectInfo, dest?: StorageObjectInfo): boolean {
  if (!dest) return false;
  const comparisons: boolean[] = [];
  if (source.size !== undefined && dest.size !== undefined) {
    comparisons.push(source.size === dest.size);
  }
  if (source.etag && dest.etag) {
    comparisons.push(source.etag === dest.etag);
  }
  if (source.contentType && dest.contentType) {
    comparisons.push(source.contentType === dest.contentType);
  }
  if (comparisons.length === 0) return false;
  return comparisons.every(Boolean);
}

async function runManagedDataDump(srcUrl: string, dumpPath: string): Promise<void> {
  const pgDump = resolvePgBinary('pg_dump');
  if (!pgDump) {
    throw new Error('pg_dump binary not found. Set PG_DUMP_PATH or PG_BIN_DIR.');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-managed-'));
  const rawDump = path.join(tmpDir, 'managed-raw.sql');
  const commonArgs = [
    `--dbname=${srcUrl}`,
    '--format=plain',
    '--encoding=UTF8',
    '--no-owner',
    '--no-privileges',
    '--inserts',
    '--data-only',
  ];
  const dataOnlyArgs = managedDataSchemas.flatMap(s => ['--schema', s]);

  try {
    await spawnAndWait(pgDump, [...commonArgs, ...dataOnlyArgs, `--file=${rawDump}`]);
    await fs.promises.writeFile(
      dumpPath,
      `-- Managed schemas data-only\nSET session_replication_role = replica;\n\n`,
      'utf8',
    );
    await appendFilteredWithoutPgsodium(rawDump, dumpPath, 'a');
    await fs.promises.appendFile(dumpPath, `\nSET session_replication_role = origin;\n`, 'utf8');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function ensureCacheDir() {
  fs.mkdirSync(CACHE_ROOT, { recursive: true });
}

function normalizeBucketNames(buckets: { name: string }[]): string[] {
  return buckets.map(bucket => bucket.name).sort();
}

function readStorageRefreshState(): StorageRefreshState | null {
  try {
    const raw = fs.readFileSync(STORAGE_REFRESH_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StorageRefreshState>;
    if (
      !parsed ||
      typeof parsed.srcUrl !== 'string' ||
      typeof parsed.destUrl !== 'string' ||
      !Array.isArray(parsed.buckets) ||
      (parsed.phase !== 'pending' && parsed.phase !== 'uploading')
    ) {
      return null;
    }
    const buckets = parsed.buckets.filter((bucket): bucket is string => typeof bucket === 'string');
    return {
      srcUrl: parsed.srcUrl,
      destUrl: parsed.destUrl,
      buckets,
      phase: parsed.phase,
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : '',
    };
  } catch {
    return null;
  }
}

function storageRefreshStateMatches(
  state: StorageRefreshState,
  srcUrl: string,
  destUrl: string,
  bucketNames: string[],
): boolean {
  if (state.srcUrl !== srcUrl || state.destUrl !== destUrl) return false;
  const stateBuckets = [...state.buckets].sort();
  const currentBuckets = [...bucketNames].sort();
  if (stateBuckets.length !== currentBuckets.length) return false;
  for (let i = 0; i < stateBuckets.length; i += 1) {
    if (stateBuckets[i] !== currentBuckets[i]) return false;
  }
  return true;
}

function writeStorageRefreshState(state: StorageRefreshState) {
  ensureCacheDir();
  fs.writeFileSync(STORAGE_REFRESH_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function clearStorageRefreshState() {
  fs.rmSync(STORAGE_REFRESH_STATE_PATH, { force: true });
}

async function dropSchemas(destUrl: string) {
  await withPgClient(destUrl, 'drop schemas', async dest => {
    const res = await dest.query<{
      nspname: string;
    }>(
      `
      select nspname
      from pg_namespace
      where nspname not like 'pg_toast_temp_%'
        and nspname not like 'pg_temp_%'
      order by nspname;
    `,
    );

    const droppable = res.rows
      .map(r => r.nspname)
      .filter(n => !protectedSchemas.has(n));

    for (const schema of droppable) {
      console.log(`Dropping schema "${schema}" ...`);
      try {
        await dest.query(`drop schema if exists "${schema}" cascade;`);
      } catch (err) {
        console.warn(`  Skipped drop for schema "${schema}": ${(err as Error).message}`);
      }
    }
  });
}

async function ensurePublicSchema(destUrl: string) {
  await withPgClient(destUrl, 'ensure public schema', async client => {
    await client.query('create schema if not exists public;');
  });
}

async function truncateManagedTables(destUrl: string) {
  if (managedDataSchemas.length === 0) return;
  await withPgClient(destUrl, 'truncate managed tables', async client => {
    const res = await client.query<{ table_schema: string; table_name: string }>(
      `
        select table_schema, table_name
        from information_schema.tables
        where table_schema = any($1::text[])
          and table_type = 'BASE TABLE';
      `,
      [managedDataSchemas],
    );
    if (res.rows.length === 0) {
      console.log('No managed tables to clean.');
      return;
    }
    console.log(`Cleaning managed schemas (${managedDataSchemas.join(', ')}) ...`);
    for (const row of res.rows) {
      const qualified = `"${row.table_schema}"."${row.table_name}"`;
      try {
        await client.query(`truncate table ${qualified} cascade;`);
        continue;
      } catch (err) {
        console.warn(`  Truncate failed for ${qualified}: ${(err as Error).message}`);
      }
      try {
        await client.query(`delete from ${qualified};`);
      } catch (err) {
        console.warn(`  Delete failed for ${qualified}: ${(err as Error).message}`);
      }
    }
  });
}

async function dropPublications(destUrl: string) {
  await withPgClient(destUrl, 'drop publications', async client => {
    const res = await client.query<{ pubname: string }>(
      `
        select pubname
        from pg_publication
        where pubname in ('supabase_realtime', 'supabase_realtime_internal');
      `,
    );
    for (const row of res.rows) {
      console.log(`Dropping publication "${row.pubname}" ...`);
      try {
        await client.query(`drop publication if exists "${row.pubname}";`);
      } catch (err) {
        console.warn(`  Skipped drop for publication "${row.pubname}": ${(err as Error).message}`);
      }
    }
  });
}

type ResumeState = {
  publicRows: number;
  authCount: number;
  storageCount: number;
};

async function detectResumeState(destUrl: string): Promise<ResumeState | null> {
  try {
    return await withPgClient(destUrl, 'detect resume', async client => {
      const publicRes = await client.query<{ rows: string }>(
        `select coalesce(sum(n_live_tup), 0)::bigint as rows from pg_stat_user_tables where schemaname = 'public';`,
      );
      const authRes = await client.query<{ count: string }>(
        `select count(*)::bigint as count from auth.users;`,
      );
      const storageRes = await client.query<{ count: string }>(
        `select count(*)::bigint as count from storage.objects;`,
      );

      return {
        publicRows: Number(publicRes.rows[0]?.rows ?? 0),
        authCount: Number(authRes.rows[0]?.count ?? 0),
        storageCount: Number(storageRes.rows[0]?.count ?? 0),
      };
    });
  } catch (err) {
    console.warn(`Resume detection failed: ${(err as Error).message}`);
    return null;
  }
}

async function applySqlDump(destUrl: string, dumpPath: string) {
  const psql = resolvePgBinary('psql');
  if (psql) {
    console.log(`Applying dump via psql ...`);
    await spawnAndWait(psql, [
      '-q',
      `--dbname=${destUrl}`,
      '--echo-errors',
      '--set',
      'ON_ERROR_STOP=1',
      '--file',
      dumpPath,
    ]);
    return;
  }

  // Fallback: apply via pg client (may be memory heavy for large dumps)
  const sql = await fs.promises.readFile(dumpPath, 'utf8');
  console.log(`Applying dump via pg client (${(sql.length / 1_000_000).toFixed(1)} MB) ...`);
  const client = new Client({
    connectionString: destUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function copyStorageBuckets(
  srcUrl: string,
  srcKey: string,
  destUrl: string,
  destKey: string,
  buckets: { name: string; public: boolean }[],
  refreshStorage: boolean,
  resumeStorage: boolean,
  onRefreshDeletionComplete?: () => void,
) {
  console.log(`Copying storage buckets (${buckets.length}) ...`);
  const src = createSupabaseClient(srcUrl, srcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-client-info': 'clone-supabase-script' } },
  });
  const dest = createSupabaseClient(destUrl, destKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-client-info': 'clone-supabase-script' } },
  });

  const snapshots: BucketSnapshot[] = [];

  for (const bucket of buckets) {
    console.log(`\nBucket "${bucket.name}" ...`);
    const { error: createErr } = await dest.storage.createBucket(bucket.name, {
      public: bucket.public,
    });
    if (createErr && !createErr.message.includes('already exists')) {
      throw new Error(`Failed to ensure bucket ${bucket.name}: ${createErr.message}`);
    }

    const srcObjects = await listAllObjects(src, bucket.name);
    const destObjects = await listAllObjects(dest, bucket.name);
    const srcPaths = new Set(srcObjects.map(obj => obj.path));
    const extraCount = destObjects.filter(obj => !srcPaths.has(obj.path)).length;

    snapshots.push({ bucket, srcObjects, destObjects, extraCount });
  }

  if (refreshStorage && !resumeStorage) {
    for (const snapshot of snapshots) {
      const srcPaths = new Set(snapshot.srcObjects.map(obj => obj.path));
      const toRemove = snapshot.destObjects.filter(obj => srcPaths.has(obj.path)).map(obj => obj.path);
      if (toRemove.length) {
        console.log(
          `  Removing ${toRemove.length} destination object(s) that match source paths in "${snapshot.bucket.name}"`,
        );
        const chunkSize = 100;
        for (let i = 0; i < toRemove.length; i += chunkSize) {
          const chunk = toRemove.slice(i, i + chunkSize);
          await withStorageRetries(async () => {
            const { error } = await dest.storage.from(snapshot.bucket.name).remove(chunk);
            if (error) {
              throw new Error(
                `Remove failed for bucket ${snapshot.bucket.name}: ${formatStorageError(error)}`,
              );
            }
          }, `remove ${snapshot.bucket.name} (${i + chunk.length}/${toRemove.length})`);
        }
      }
    }
    if (onRefreshDeletionComplete) onRefreshDeletionComplete();
  }

  for (const snapshot of snapshots) {
    const { bucket, srcObjects, destObjects, extraCount } = snapshot;
    const destCount = refreshStorage && !resumeStorage ? extraCount : destObjects.length;
    let skipCount = 0;
    let toUpload: StorageObjectInfo[] = [];

    if (refreshStorage) {
      if (resumeStorage) {
        const destPaths = new Set(destObjects.map(obj => obj.path));
        toUpload = srcObjects.filter(obj => !destPaths.has(obj.path));
        skipCount = srcObjects.length - toUpload.length;
      } else {
        toUpload = srcObjects;
      }
    } else {
      const destByPath = new Map(destObjects.map(obj => [obj.path, obj]));
      for (const obj of srcObjects) {
        const existing = destByPath.get(obj.path);
        if (isMatchingObject(obj, existing)) {
          skipCount += 1;
          continue;
        }
        toUpload.push(obj);
      }
    }

    console.log(
      `  Source objects: ${srcObjects.length} | Destination objects: ${destCount} (extra: ${extraCount})`,
    );
    if (refreshStorage) {
      if (resumeStorage) {
        console.log(`  Will upload ${toUpload.length} object(s), skip ${skipCount} already present`);
      } else {
        console.log(`  Will upload ${toUpload.length} object(s) after refresh`);
      }
    } else {
      console.log(`  Will upload ${toUpload.length} object(s), skip ${skipCount} already matching`);
    }

    let uploaded = 0;
    const totalUploads = toUpload.length;
    for (const obj of toUpload) {
      const blob = await withStorageRetries(async () => {
        const { data, error } = await src.storage.from(bucket.name).download(obj.path);
        if (error || !data) {
          throw new Error(`Download failed for ${bucket.name}/${obj.path}: ${formatStorageError(error)}`);
        }
        return data;
      }, `download ${bucket.name}/${obj.path}`);

      const buffer = Buffer.from(await blob.arrayBuffer());
      const contentType = blob.type || obj.contentType || undefined;
      await withStorageRetries(async () => {
        const upload = await dest.storage
          .from(bucket.name)
          .upload(obj.path, buffer, { upsert: true, contentType });
        if (upload.error) {
          throw new Error(`Upload failed for ${bucket.name}/${obj.path}: ${formatStorageError(upload.error)}`);
        }
      }, `upload ${bucket.name}/${obj.path}`);
      uploaded += 1;
      if (uploaded % 250 === 0 || uploaded === totalUploads) {
        console.log(`  Uploaded ${uploaded}/${totalUploads}`);
      }
    }
  }
}

async function listAllObjects(
  supa: ReturnType<typeof createSupabaseClient>,
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

      for (const item of data ?? []) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (!item.id && !item.metadata) {
          // Treat as folder
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

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  const srcDb = requireEnv('CLONE_SOURCE_DATABASE_URL');
  const destDb = requireEnv('CLONE_DEST_DATABASE_URL');
  const srcUrl = requireEnv('CLONE_SOURCE_SUPABASE_URL');
  const destUrl = requireEnv('CLONE_DEST_SUPABASE_URL');
  const srcKey = requireEnv('CLONE_SOURCE_SERVICE_ROLE');
  const destKey = requireEnv('CLONE_DEST_SERVICE_ROLE');

  console.log('Source DB:', redactUrl(srcDb));
  console.log('Dest   DB:', redactUrl(destDb));
  console.log('Source Supabase URL:', srcUrl);
  console.log('Dest   Supabase URL:', destUrl);
  console.log(
    `Mode: verify=${flags.verifyOnly ? 'yes' : 'no'} | withStorage=${flags.withStorage} | refreshStorage=${flags.storageRefresh} | resume=${flags.resume}`,
  );

  // Verify connectivity first
  await checkDbConnection(srcDb, 'source');
  await checkDbConnection(destDb, 'dest');

  let buckets: { name: string; public: boolean }[] = [];
  if (flags.withStorage || flags.verifyOnly) {
    const srcBuckets = await listBuckets(srcUrl, srcKey, 'source');
    const destBuckets = await listBuckets(destUrl, destKey, 'dest');
    console.log(
      `Buckets (source -> dest): ${srcBuckets.map(b => b.name).join(', ')} | ${destBuckets
        .map(b => b.name)
        .join(', ')}`,
    );
    buckets = srcBuckets;
  }

  if (flags.verifyOnly) {
    console.log('Verification complete (no changes made).');
    return;
  }

  if (!flags.yes) {
    console.log('Add --yes to run the clone. Skipping because --yes not supplied.');
    return;
  }

  let resumeState: ResumeState | null = null;
  let resumeManagedOnly = false;
  let skipDbClone = false;

  if (flags.resume) {
    resumeState = await detectResumeState(destDb);
    if (resumeState) {
      if (
        resumeState.publicRows > 0 &&
        resumeState.authCount === 0 &&
        resumeState.storageCount === 0
      ) {
        resumeManagedOnly = true;
        console.log('Detected existing public data with empty auth/storage. Will resume from managed data.');
      } else if (resumeState.publicRows > 0 && (resumeState.authCount > 0 || resumeState.storageCount > 0)) {
        skipDbClone = true;
        console.log('Resume mode: destination already has managed data. Skipping DB clone.');
      }
    }
  }

  if (!flags.skipDb) {
    if (skipDbClone) {
      // No-op
    } else if (resumeManagedOnly) {
      ensureCacheDir();
      const runDir = path.join(CACHE_ROOT, `managed-${Date.now()}`);
      const dumpPath = path.join(runDir, MANAGED_DUMP_NAME);
      fs.mkdirSync(runDir, { recursive: true });

      await runManagedDataDump(srcDb, dumpPath);
      await applySqlDump(destDb, dumpPath);
      await fs.promises.unlink(dumpPath).catch(() => {});
      console.log('Managed data restore completed.');
    } else {
      const dumpPath = path.join(os.tmpdir(), `supabase-clone-${Date.now()}.sql`);
      await runSupabaseDump(srcDb, dumpPath);

      if (!flags.skipWipe) {
        await dropSchemas(destDb);
      } else {
        console.log('Skipping schema wipe (--skip-wipe). Existing objects may cause conflicts.');
      }

      await ensurePublicSchema(destDb);
      await truncateManagedTables(destDb);
      await dropPublications(destDb);
      await applySqlDump(destDb, dumpPath);
      await fs.promises.unlink(dumpPath).catch(() => {});
      console.log('Database clone completed.');
    }
  } else {
    console.log('Skipping DB clone (--skip-db).');
  }

  if (flags.withStorage) {
    let resumeStorage = false;
    let refreshState: StorageRefreshState | null = null;

    if (flags.storageRefresh) {
      const bucketNames = normalizeBucketNames(buckets);
      const existingState = readStorageRefreshState();
      if (existingState && storageRefreshStateMatches(existingState, srcUrl, destUrl, bucketNames)) {
        refreshState = existingState;
        resumeStorage = existingState.phase === 'uploading';
        console.log(
          `Storage refresh state: ${existingState.phase}` +
            (existingState.startedAt ? ` (started ${existingState.startedAt})` : ''),
        );
      } else {
        refreshState = {
          srcUrl,
          destUrl,
          buckets: bucketNames,
          phase: 'pending',
          startedAt: new Date().toISOString(),
        };
        writeStorageRefreshState(refreshState);
        console.log('Storage refresh state created.');
      }
    }

    if (flags.storageRefresh) {
      if (resumeStorage) {
        console.log('Storage mode: refresh resume (skip deletion, continue uploads).');
      } else {
        console.log('Storage mode: refresh (delete matching paths then re-upload).');
      }
    }

    await copyStorageBuckets(
      srcUrl,
      srcKey,
      destUrl,
      destKey,
      buckets,
      flags.storageRefresh,
      resumeStorage,
      () => {
        if (!refreshState || refreshState.phase === 'uploading') return;
        refreshState.phase = 'uploading';
        writeStorageRefreshState(refreshState);
      },
    );

    if (flags.storageRefresh) {
      clearStorageRefreshState();
    }
    console.log('Storage copy completed.');
  }

  console.log('All done.');
}

main().catch(err => {
  console.error('Clone failed:', err.message);
  process.exitCode = 1;
});
