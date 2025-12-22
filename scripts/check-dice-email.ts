import { config } from 'dotenv';
import { resolve } from 'path';
import { graphFetch } from '../src/lib/msgraph/client';
import { parseDiceCandidateMetadata } from '../src/lib/email/diceMetadataParser';

config({ path: resolve(__dirname, '..', '.env.local') });

const MAILBOX = 'mhk@bnbtechinc.com';
const SUBJECT_QUERY = 'Sr Java Developer - Lakshmi Manasa has applied on Dice. Job ID - 121114493';

type GraphMessage = {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  from?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
  bodyPreview?: string;
  body?: {
    contentType?: string;
    content?: string;
  };
};

const htmlEntityMap: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
};

const replaceHtmlEntities = (value: string) =>
  value.replace(/&[a-zA-Z0-9#]+;/g, entity => htmlEntityMap[entity] ?? entity);

const htmlToPlainText = (html: string): string =>
  replaceHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|table)>/gi, '\n')
      .replace(/<\/t[dh]>/gi, '\t')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
  );

const splitLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

function summarizeLines(lines: string[]): string[] {
  const labelTokens = [
    'email',
    'phone',
    'work authorization',
    'representation',
    'location',
    'match',
    'resume',
    'cover letter'
  ];

  return lines.filter(line =>
    labelTokens.some(token => line.toLowerCase().includes(token))
  );
}

async function searchMessages(): Promise<GraphMessage[]> {
  const phrase = SUBJECT_QUERY.replace(/"/g, '\\"');
  const encoded = encodeURIComponent(`"subject:${phrase}"`);
  const url = `/v1.0/users/${MAILBOX}/messages?$search=${encoded}&$select=id,subject,receivedDateTime,from,bodyPreview,body&$top=10`;

  const response = await graphFetch(url, { needsConsistencyLevel: true });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graph search failed: ${response.status} ${error}`);
  }
  const data = await response.json();
  return (data.value || []) as GraphMessage[];
}

async function getMessageDetail(messageId: string): Promise<GraphMessage> {
  const url = `/v1.0/users/${MAILBOX}/messages/${encodeURIComponent(
    messageId
  )}?$select=id,subject,receivedDateTime,from,bodyPreview,body`;
  const response = await graphFetch(url);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Message detail failed: ${response.status} ${error}`);
  }
  return (await response.json()) as GraphMessage;
}

async function main() {
  console.log('='.repeat(80));
  console.log('Dice email inspection');
  console.log('Mailbox:', MAILBOX);
  console.log('Subject query:', SUBJECT_QUERY);
  console.log('='.repeat(80));

  const messages = await searchMessages();
  if (messages.length === 0) {
    console.log('No messages found for subject query.');
    return;
  }

  const match = messages.find(message =>
    (message.subject || '').toLowerCase().includes('lakshmi manasa has applied on dice')
  ) ?? messages[0];

  const detail = match.body?.content ? match : await getMessageDetail(match.id);

  console.log('Selected message:');
  console.log(`- Subject: ${detail.subject || '(no subject)'}`);
  console.log(`- Received: ${detail.receivedDateTime || 'unknown'}`);
  console.log(
    `- From: ${detail.from?.emailAddress?.name || 'unknown'} <${detail.from?.emailAddress?.address || 'unknown'}>`
  );

  const bodyHtml =
    detail.body?.contentType?.toLowerCase() === 'html' ? detail.body.content ?? null : null;
  const bodyText =
    detail.body?.contentType?.toLowerCase() === 'text' ? detail.body.content ?? null : null;

  const metadata = parseDiceCandidateMetadata({
    subject: detail.subject ?? null,
    bodyPreview: detail.bodyPreview ?? null,
    bodyHtml,
    bodyText
  });

  console.log('\nParsed metadata:');
  console.log(JSON.stringify(metadata, null, 2));

  const rawText = bodyText || (bodyHtml ? htmlToPlainText(bodyHtml) : '') || '';
  const lines = splitLines(rawText);
  const highlightLines = summarizeLines(lines);

  if (highlightLines.length > 0) {
    console.log('\nRelevant lines detected:');
    highlightLines.slice(0, 20).forEach(line => console.log(`- ${line}`));
  } else {
    console.log('\nNo label lines detected in message body.');
  }
}

main().catch(error => {
  console.error('Failed to inspect Dice email:', error);
  process.exit(1);
});
