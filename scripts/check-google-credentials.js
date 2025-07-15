console.log('🔍 GOOGLE SERVICE ACCOUNT CREDENTIALS CHECK');
console.log('==========================================');

const requiredEnvs = [
  'GOOGLE_SERVICE_ACCOUNT_TYPE',
  'GOOGLE_SERVICE_ACCOUNT_PROJECT_ID',
  'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID',
  'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
  'GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL',
  'GOOGLE_SERVICE_ACCOUNT_CLIENT_ID',
  'GOOGLE_SERVICE_ACCOUNT_AUTH_URI',
  'GOOGLE_SERVICE_ACCOUNT_TOKEN_URI',
  'GOOGLE_SERVICE_ACCOUNT_AUTH_PROVIDER_X509_CERT_URL',
  'GOOGLE_SERVICE_ACCOUNT_CLIENT_X509_CERT_URL',
  'GOOGLE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN'
];

console.log('\n📋 Environment Variables Status:');
let missingCount = 0;

requiredEnvs.forEach(envVar => {
  const value = process.env[envVar];
  const status = value ? '✅ Present' : '❌ Missing';
  console.log(`   ${envVar}: ${status}`);
  if (!value) missingCount++;
});

console.log(`\n📊 Summary: ${requiredEnvs.length - missingCount}/${requiredEnvs.length} environment variables configured`);

if (missingCount > 0) {
  console.log('\n🚨 ISSUE DETECTED: Missing Google Service Account credentials');
  console.log('');
  console.log('🔧 TO FIX THIS ISSUE:');
  console.log('');
  console.log('1. 📋 Create a Google Cloud Service Account:');
  console.log('   - Go to: https://console.cloud.google.com/iam-admin/serviceaccounts');
  console.log('   - Create a new service account');
  console.log('   - Generate a JSON key file');
  console.log('');
  console.log('2. 🔑 Add the service account to your Google Sheet:');
  console.log('   - Open your Google Sheet');
  console.log('   - Click "Share" button');
  console.log('   - Add the service account email with "Editor" permissions');
  console.log('');
  console.log('3. 📝 Add credentials to your .env.local file:');
  console.log('   GOOGLE_SERVICE_ACCOUNT_TYPE="service_account"');
  console.log('   GOOGLE_SERVICE_ACCOUNT_PROJECT_ID="your-project-id"');
  console.log('   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID="your-private-key-id"');
  console.log('   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"');
  console.log('   GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL="your-service-account@your-project.iam.gserviceaccount.com"');
  console.log('   GOOGLE_SERVICE_ACCOUNT_CLIENT_ID="your-client-id"');
  console.log('   GOOGLE_SERVICE_ACCOUNT_AUTH_URI="https://accounts.google.com/o/oauth2/auth"');
  console.log('   GOOGLE_SERVICE_ACCOUNT_TOKEN_URI="https://oauth2.googleapis.com/token"');
  console.log('   GOOGLE_SERVICE_ACCOUNT_AUTH_PROVIDER_X509_CERT_URL="https://www.googleapis.com/oauth2/v1/certs"');
  console.log('   GOOGLE_SERVICE_ACCOUNT_CLIENT_X509_CERT_URL="https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com"');
  console.log('   GOOGLE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN="googleapis.com"');
  console.log('');
  console.log('4. 🔄 Restart your development server after adding the credentials');
  console.log('');
  console.log('⚠️  IMPORTANT: Make sure to escape newlines in the private key with \\n');
  console.log('⚠️  IMPORTANT: Never commit the .env.local file to version control');
} else {
  console.log('\n✅ All Google Service Account credentials are configured!');
  console.log('');
  console.log('🔍 If you\'re still having sync issues, it might be:');
  console.log('   1. The service account doesn\'t have access to the sheet');
  console.log('   2. The sheet URL is incorrect');
  console.log('   3. The sheet structure doesn\'t match expected format');
  console.log('');
  console.log('💡 Try running the AP sync again and check the server logs for more details.');
}

console.log('\n==========================================');
console.log('🔍 CREDENTIALS CHECK COMPLETED'); 