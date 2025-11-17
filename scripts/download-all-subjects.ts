import { config } from 'dotenv';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { graphFetch } from '../src/lib/msgraph/client';

config({ path: resolve(__dirname, '..', '.env.local') });

const MAILBOX = 'karan@bnbtechinc.com';
const MAX_TOTAL_MESSAGES = 100_000;
const MESSAGES_PAGE_SIZE = 500;
const FOLDERS_PAGE_SIZE = 200;
const OUTPUT_DIR = resolve(process.cwd(), 'exports');
const OUTPUT_FILE = resolve(OUTPUT_DIR, `mailbox-subjects-${MAILBOX.replace('@', '_at_')}.csv`);

interface Folder {
  id: string;
  displayName: string;
  parentFolderId?: string | null;
  childFolderCount?: number;
}

interface GraphMessage {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  from?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
  hasAttachments?: boolean;
}

interface MessageRecord {
  id: string;
  receivedAt: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  hasAttachments: boolean;
  folderPath: string;
}

async function fetchFolderBatch(folderId?: string): Promise<Folder[]> {
  const base = folderId
    ? `/v1.0/users/${MAILBOX}/mailFolders/${encodeURIComponent(folderId)}/childFolders`
    : `/v1.0/users/${MAILBOX}/mailFolders`;
  let url = `${base}?$select=id,displayName,parentFolderId,childFolderCount&$top=${FOLDERS_PAGE_SIZE}`;
  const results: Folder[] = [];

  while (url) {
    const response = await graphFetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list folders: ${response.status} ${errorText}`);
    }
    const data = await response.json();
    results.push(...((data.value as Folder[]) || []));
    url = data['@odata.nextLink'] || '';
  }

  return results;
}

async function fetchAllFolders(): Promise<Folder[]> {
  const all: Folder[] = [];
  const queue: (string | undefined)[] = [undefined];

  while (queue.length > 0) {
    const parentId = queue.shift();
    const folders = await fetchFolderBatch(parentId);
    all.push(...folders);
    for (const folder of folders) {
      if ((folder.childFolderCount || 0) > 0) {
        queue.push(folder.id);
      }
    }
  }

  return all;
}

function buildFolderPath(folder: Folder, folderMap: Map<string, Folder>, memo: Map<string, string>): string {
  if (memo.has(folder.id)) {
    return memo.get(folder.id)!;
  }
  const name = folder.displayName || 'Unnamed';
  if (!folder.parentFolderId) {
    memo.set(folder.id, name);
    return name;
  }
  const parent = folderMap.get(folder.parentFolderId);
  if (!parent) {
    memo.set(folder.id, name);
    return name;
  }
  const parentPath = buildFolderPath(parent, folderMap, memo);
  const path = `${parentPath}/${name}`;
  memo.set(folder.id, path);
  return path;
}

async function fetchMessagesForFolder(folder: Folder, remaining: number): Promise<GraphMessage[]> {
  if (remaining <= 0) {
    return [];
  }

  const folderId = encodeURIComponent(folder.id);
  let url = `/v1.0/users/${MAILBOX}/mailFolders/${folderId}/messages?$select=id,subject,receivedDateTime,from,hasAttachments&$orderby=receivedDateTime desc&$top=${Math.min(MESSAGES_PAGE_SIZE, remaining)}`;
  const messages: GraphMessage[] = [];

  while (url && messages.length < remaining) {
    const response = await graphFetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list messages for folder ${folder.displayName}: ${response.status} ${errorText}`);
    }
    const data = await response.json();
    const batch = (data.value as GraphMessage[]) || [];
    messages.push(...batch);
    const nextLink = data['@odata.nextLink'];
    if (!nextLink) {
      break;
    }
    url = nextLink;
  }

  return messages.slice(0, remaining);
}

function formatCsvLine(record: MessageRecord): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [
    escape(record.folderPath),
    escape(record.id),
    escape(record.receivedAt),
    escape(record.fromName),
    escape(record.fromEmail),
    escape(record.subject),
    record.hasAttachments ? 'yes' : 'no'
  ].join(',');
}

async function main() {
  console.log('='.repeat(80));
  console.log('Downloading ALL mailbox subjects');
  console.log('Mailbox:', MAILBOX);
  console.log('Max messages:', MAX_TOTAL_MESSAGES);
  console.log('Saving to:', OUTPUT_FILE);
  console.log('='.repeat(80));

  const folders = await fetchAllFolders();
  console.log(`Discovered ${folders.length} folder(s).`);

  const folderMap = new Map<string, Folder>(folders.map(f => [f.id, f]));
  const pathMemo = new Map<string, string>();

  const records: MessageRecord[] = [];

  for (const folder of folders) {
    const remaining = MAX_TOTAL_MESSAGES - records.length;
    if (remaining <= 0) {
      break;
    }
    const folderPath = buildFolderPath(folder, folderMap, pathMemo);
    console.log(`Fetching messages for folder: ${folderPath}`);
    const messages = await fetchMessagesForFolder(folder, remaining);
    console.log(`  Retrieved ${messages.length} messages from ${folderPath}`);
    for (const message of messages) {
      records.push({
        id: message.id,
        receivedAt: message.receivedDateTime || '',
        subject: message.subject || '',
        fromName: message.from?.emailAddress?.name || '',
        fromEmail: message.from?.emailAddress?.address || '',
        hasAttachments: Boolean(message.hasAttachments),
        folderPath
      });
    }
  }

  console.log(`Total messages collected: ${records.length}`);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const header = '"folder_path","message_id","received_at","from_name","from_email","subject","has_attachments"';
  const csv = [header, ...records.map(formatCsvLine)].join('\n');
  writeFileSync(OUTPUT_FILE, csv, 'utf8');

  console.log('CSV saved.');
}

main().catch(error => {
  console.error('Failed to download all mailbox subjects:', error);
  process.exit(1);
});
