/**
 * Simple test script to validate Microsoft Graph connectivity
 * Run with: npx tsx scripts/test-msgraph.ts
 */

import { getAppToken, graphFetch } from '@/lib/msgraph/client';
import { searchMessages } from '@/lib/msgraph/outlook';

async function testMicrosoftGraph() {
  try {
    console.log('🔑 Testing Microsoft Graph authentication...');
    
    // Test token acquisition
    const token = await getAppToken();
    console.log('✅ Successfully acquired access token');
    console.log(`Token length: ${token.length} characters`);
    
    // Test basic Graph API call
    console.log('\n📧 Testing Outlook API...');
    const response = await graphFetch('/v1.0/users', { needsConsistencyLevel: false });
    
    if (!response.ok) {
      throw new Error(`Graph API call failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Successfully called Graph API, found ${data.value?.length || 0} users`);
    
    // Test message search (limited to 1 message)
    console.log('\n🔍 Testing message search...');
    try {
      const { messages } = await searchMessages('hasAttachments:yes', 1);
      console.log(`✅ Successfully searched messages, found ${messages.length} messages with attachments`);
      
      if (messages.length > 0) {
        const message = messages[0];
        console.log(`Sample message: "${message.subject}" from ${message.from?.emailAddress?.address || 'unknown'}`);
      }
    } catch (searchError) {
      console.warn('⚠️  Message search failed (this might be expected if mailbox is empty):', 
        searchError instanceof Error ? searchError.message : 'Unknown error');
    }
    
    console.log('\n🎉 Microsoft Graph connectivity test completed successfully!');
    
  } catch (error) {
    console.error('❌ Microsoft Graph test failed:', error);
    process.exit(1);
  }
}

// Run the test
testMicrosoftGraph();