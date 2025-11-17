import { config } from 'dotenv';
import { resolve } from 'path';
import { createEmailProvider } from '../src/lib/providers/msgraph-provider';

config({ path: resolve(__dirname, '..', '.env.local') });

async function main() {
  const mailbox = process.argv[2] || 'karan@bnbtechinc.com';
  const search = process.argv[3];
  if (!search) {
    console.error('Usage: npx tsx scripts/count-messages.ts <mailbox> <searchText>');
    process.exit(1);
  }

  const provider = createEmailProvider(mailbox);
  const messages = await provider.listMessages({
    jobTitle: search,
    limit: 5000,
    mode: 'graph-search'
  });

  console.log(`Mailbox: ${mailbox}`);
  console.log(`Search: ${search}`);
  console.log(`Messages returned: ${messages.length}`);
  console.log('First 5 subjects:');
  for (const msg of messages.slice(0, 5)) {
    console.log(`- ${msg.receivedAt.toISOString()} | ${msg.subject}`);
  }
}

main().catch(err => {
  console.error('Error counting messages:', err);
  process.exit(1);
});
