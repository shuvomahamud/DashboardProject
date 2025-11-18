import { config } from 'dotenv';
import { resolve } from 'path';
import { createEmailProvider } from '../src/lib/providers/msgraph-provider';

config({ path: resolve(__dirname, '..', '.env.local') });

const MAILBOX = 'karan@bnbtechinc.com';
const SEARCH_TEXT = '082714232';
const LIMIT = 100000;

async function main() {
  console.log('='.repeat(80));
  console.log('Microsoft Graph Email Count Test');
  console.log('Mailbox:', MAILBOX);
  console.log('Search Text:', SEARCH_TEXT);
  console.log('Limit:', LIMIT);
  console.log('Mode: graph-search');
  console.log('='.repeat(80));

  const provider = createEmailProvider(MAILBOX);
  const { messages } = await provider.listMessages({
    jobTitle: SEARCH_TEXT,
    limit: LIMIT,
    mode: 'graph-search'
  });

  console.log(`\nTotal messages returned: ${messages.length}`);

  if (messages.length > 0) {
    console.log('\nSample (first 10) messages:');
    messages.slice(0, 10).forEach((msg, index) => {
      console.log(
        `#${index + 1} ${msg.receivedAt.toISOString()} | ` +
        `"${msg.subject || '(no subject)'}" | attachments=${msg.hasAttachments}`
      );
    });
  }

  const uniqueIds = new Set(messages.map(m => m.externalId));
  if (uniqueIds.size !== messages.length) {
    console.log(`\nWarning: ${messages.length - uniqueIds.size} duplicate IDs detected in results.`);
  }

  console.log('\nDone.');
}

main().catch(error => {
  console.error('Error running email count test:', error);
  process.exit(1);
});
