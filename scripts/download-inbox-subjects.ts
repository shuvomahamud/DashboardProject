import { config } from 'dotenv';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { graphFetch } from '../src/lib/msgraph/client';

config({ path: resolve(__dirname, '..', '.env.local') });

const MAILBOX = 'karan@bnbtechinc.com';
const MAX_MESSAGES = 20000;
const PAGE_SIZE = 500;
const OUTPUT_DIR = resolve(process.cwd(), 'exports');
const OUTPUT_PATH = resolve(OUTPUT_DIR, `inbox-subjects-${MAILBOX.replace('@', '_at_')}.csv`);

interface GraphMessage {
  id: string;
  subject?: string;
  receivedDateTime: string;
  from?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
  hasAttachments?: boolean;
}

async function fetchInboxSubjects(): Promise<GraphMessage[]> {
  let url = `/v1.0/users/${MAILBOX}/mailFolders/Inbox/messages?$select=id,subject,receivedDateTime,from,hasAttachments&$orderby=receivedDateTime desc&$top=${PAGE_SIZE}`;
  const messages: GraphMessage[] = [];

  while (url && messages.length < MAX_MESSAGES) {
    const response = await graphFetch(url);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Graph request failed: ${response.status} ${error}`);
    }

    const data = await response.json();
    const pageMessages = (data.value || []) as GraphMessage[];
    messages.push(...pageMessages);

    if (!data['@odata.nextLink']) {
      break;
    }
    url = data['@odata.nextLink'];
  }

  return messages.slice(0, MAX_MESSAGES);
}

function toCsvLine(message: GraphMessage): string {
  const received = message.receivedDateTime || '';
  const subject = (message.subject || '').replace(/"/g, '""');
  const sender = message.from?.emailAddress?.address || '';
  const senderName = message.from?.emailAddress?.name || '';
  const hasAttachments = message.hasAttachments ? 'yes' : 'no';

  return `"${message.id}","${received}","${senderName.replace(/"/g, '""')}","${sender.replace(/"/g, '""')}","${subject}","${hasAttachments}"`;
}

async function main() {
  console.log('='.repeat(80));
  console.log('Downloading inbox subjects');
  console.log('Mailbox:', MAILBOX);
  console.log('Max messages:', MAX_MESSAGES);
  console.log('Output:', OUTPUT_PATH);
  console.log('='.repeat(80));

  const messages = await fetchInboxSubjects();
  console.log(`Fetched ${messages.length} messages.`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const header = '"message_id","received_at","from_name","from_email","subject","has_attachments"';
  const csv = [header, ...messages.map(toCsvLine)].join('\n');
  writeFileSync(OUTPUT_PATH, csv, 'utf8');

  console.log('Saved CSV with subjects.');
}

main().catch(error => {
  console.error('Failed to download inbox subjects:', error);
  process.exit(1);
});
