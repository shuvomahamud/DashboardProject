// Test script specifically for Azure Mail access
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(__dirname, '..', '.env.local') });

const credentials = {
  MS_CLIENT_ID: process.env.MS_CLIENT_ID,
  MS_TENANT_ID: process.env.MS_TENANT_ID,
  MS_CLIENT_SECRET: process.env.MS_CLIENT_SECRET,
  MS_APP_OBJECT_ID: process.env.MS_APP_OBJECT_ID
};

const targetMailbox = 'mhk@bnbtechinc.com';

async function getAccessToken(): Promise<string | null> {
  console.log('\n=== Getting Access Token ===');
  try {
    const tokenUrl = `https://login.microsoftonline.com/${credentials.MS_TENANT_ID}/oauth2/v2.0/token`;

    const params = new URLSearchParams({
      client_id: credentials.MS_CLIENT_ID!,
      client_secret: credentials.MS_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (response.ok) {
      const tokenData = await response.json();
      console.log('✅ Successfully obtained access token');
      console.log(`Token expires in: ${tokenData.expires_in} seconds`);
      return tokenData.access_token;
    } else {
      const errorText = await response.text();
      console.log('❌ Failed to get access token:', response.status, errorText);
      return null;
    }
  } catch (error) {
    console.log('❌ Error getting access token:', error);
    return null;
  }
}

async function testGraphApiBasic(token: string): Promise<boolean> {
  console.log('\n=== Testing Basic Graph API Access ===');
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Graph API /me endpoint accessible');
      console.log(`App identity: ${data.displayName || 'Unknown'}`);
      return true;
    } else {
      // This might fail for app-only tokens, which is expected
      console.log('ℹ️ /me endpoint not accessible (expected for app-only auth)');
      return true; // This is not a failure for app-only scenarios
    }
  } catch (error) {
    console.log('❌ Error testing basic Graph API:', error);
    return false;
  }
}

async function testUserAccess(token: string): Promise<boolean> {
  console.log('\n=== Testing User Access ===');
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/users?$top=5', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Can access users in the organization');
      console.log(`Found ${data.value?.length || 0} users`);

      // Look for our target mailbox user
      const targetUser = data.value?.find((user: any) =>
        user.mail === targetMailbox || user.userPrincipalName === targetMailbox
      );

      if (targetUser) {
        console.log(`✅ Found target mailbox user: ${targetUser.displayName} (${targetUser.mail})`);
        return true;
      } else {
        console.log(`⚠️ Target mailbox ${targetMailbox} not found in first 5 users`);
        return true; // Still a success, might need to search more
      }
    } else {
      const errorText = await response.text();
      console.log('❌ Cannot access users:', response.status, errorText);
      return false;
    }
  } catch (error) {
    console.log('❌ Error testing user access:', error);
    return false;
  }
}

async function testSpecificMailboxAccess(token: string): Promise<boolean> {
  console.log(`\n=== Testing Specific Mailbox Access: ${targetMailbox} ===`);
  try {
    // Try to access the specific mailbox
    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${targetMailbox}/messages?$top=5`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Can access target mailbox messages');
      console.log(`Found ${data.value?.length || 0} messages`);

      if (data.value && data.value.length > 0) {
        const firstMessage = data.value[0];
        console.log(`Sample message: "${firstMessage.subject}" from ${firstMessage.from?.emailAddress?.address}`);
      }
      return true;
    } else {
      const errorText = await response.text();
      console.log('❌ Cannot access target mailbox messages:', response.status, errorText);

      // Try to get more specific error info
      if (response.status === 403) {
        console.log('🔍 This might be a permissions issue. Checking if user exists...');

        // Try to get user info
        const userResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${targetMailbox}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (userResponse.ok) {
          console.log('✅ User exists, this is a permissions issue');
        } else {
          console.log('❌ User might not exist or be accessible');
        }
      }
      return false;
    }
  } catch (error) {
    console.log('❌ Error testing specific mailbox access:', error);
    return false;
  }
}

async function testMailPermissions(token: string): Promise<boolean> {
  console.log('\n=== Testing Mail Permissions ===');
  try {
    // Try to access mail in general (any mailbox)
    const response = await fetch('https://graph.microsoft.com/v1.0/users?$filter=mail ne null&$top=1', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.value && data.value.length > 0) {
        const firstUser = data.value[0];
        console.log(`Testing mail access for: ${firstUser.mail}`);

        const mailResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${firstUser.id}/messages?$top=1`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (mailResponse.ok) {
          console.log('✅ Mail.Read permission is working');
          return true;
        } else {
          console.log('❌ Mail.Read permission issue:', mailResponse.status);
          return false;
        }
      } else {
        console.log('⚠️ No users with mail found');
        return false;
      }
    } else {
      console.log('❌ Cannot access users for mail testing');
      return false;
    }
  } catch (error) {
    console.log('❌ Error testing mail permissions:', error);
    return false;
  }
}

async function main() {
  console.log('🔍 Testing Azure Mail Access...');
  console.log('Configuration:');
  console.log(`- Tenant ID: ${credentials.MS_TENANT_ID}`);
  console.log(`- Client ID: ${credentials.MS_CLIENT_ID}`);
  console.log(`- Target Mailbox: ${targetMailbox}`);
  console.log(`- Expected Permission: Mail.Read (Application)`);

  // Get access token
  const token = await getAccessToken();
  if (!token) {
    console.log('\n🚨 CRITICAL: Cannot obtain access token - stopping tests');
    return;
  }

  // Run all tests
  const basicAccess = await testGraphApiBasic(token);
  const userAccess = await testUserAccess(token);
  const mailPermissions = await testMailPermissions(token);
  const specificMailbox = await testSpecificMailboxAccess(token);

  console.log('\n=== SUMMARY ===');
  console.log(`Access Token: ✅`);
  console.log(`Basic Graph API: ${basicAccess ? '✅' : '❌'}`);
  console.log(`User Access: ${userAccess ? '✅' : '❌'}`);
  console.log(`Mail Permissions: ${mailPermissions ? '✅' : '❌'}`);
  console.log(`Target Mailbox (${targetMailbox}): ${specificMailbox ? '✅' : '❌'}`);

  if (!userAccess) {
    console.log('\n🚨 ISSUE: Cannot access users - check User.Read.All permission');
  }
  if (!mailPermissions) {
    console.log('\n🚨 ISSUE: Cannot access mail - check Mail.Read permission and admin consent');
  }
  if (!specificMailbox) {
    console.log(`\n🚨 ISSUE: Cannot access ${targetMailbox} - user might not exist or additional permissions needed`);
  }

  if (userAccess && mailPermissions && specificMailbox) {
    console.log('\n🎉 SUCCESS: All tests passed! Azure mail integration is ready.');
  } else {
    console.log('\n⚠️ Some issues found. Please check the Azure app registration and permissions.');
  }
}

main().catch(console.error);