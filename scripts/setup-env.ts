import { writeFileSync, readFileSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';

function setupEnvironment() {
  console.log("🔧 Setting up environment variables...");
  
  const envLocalPath = '.env.local';
  let envContent = '';
  
  // Read existing .env.local if it exists
  if (existsSync(envLocalPath)) {
    envContent = readFileSync(envLocalPath, 'utf8');
    console.log("📄 Found existing .env.local file");
  } else {
    console.log("📄 Creating new .env.local file");
  }
  
  // Check for required variables
  const requiredVars = {
    'DATABASE_URL': 'postgresql://postgres.sgrvspqcrqvxtrahksvv:DaveSahai@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
    'NEXTAUTH_URL': 'http://localhost:3000',
    'NEXTAUTH_SECRET': randomBytes(32).toString('hex')
  };
  
  let hasChanges = false;
  
  for (const [key, defaultValue] of Object.entries(requiredVars)) {
    const regex = new RegExp(`^${key}=`, 'm');
    
    if (!regex.test(envContent)) {
      console.log(`➕ Adding ${key}...`);
      envContent += `${key}="${defaultValue}"\n`;
      hasChanges = true;
    } else {
      console.log(`✅ ${key} already exists`);
    }
  }
  
  if (hasChanges) {
    writeFileSync(envLocalPath, envContent);
    console.log("✅ .env.local file updated successfully!");
  } else {
    console.log("✅ All environment variables are already set!");
  }
  
  console.log("\n📋 Current .env.local content:");
  console.log("================================");
  console.log(readFileSync(envLocalPath, 'utf8'));
  console.log("================================");
}

setupEnvironment(); 