/**
 * Setup Supabase Storage bucket for resumes
 * Run with: npx tsx scripts/setup-supabase-storage.ts
 */

import { createClient } from '@supabase/supabase-js';

async function setupSupabaseStorage() {
  try {
    console.log('🪣 Setting up Supabase Storage...');

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE;
    const bucketName = process.env.SUPABASE_RESUMES_BUCKET || 'resumes';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE in .env.local');
    }

    console.log(`Supabase URL: ${supabaseUrl}`);
    console.log(`Target bucket: ${bucketName}`);

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('✅ Supabase client created');

    // List existing buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      throw new Error(`Failed to list buckets: ${listError.message}`);
    }

    console.log(`📋 Found ${buckets.length} existing buckets:`, buckets.map(b => b.name));

    // Check if our bucket exists
    const existingBucket = buckets.find(bucket => bucket.name === bucketName);
    
    if (existingBucket) {
      console.log(`✅ Bucket '${bucketName}' already exists (public: ${existingBucket.public})`);
    } else {
      console.log(`🔨 Creating bucket '${bucketName}'...`);
      
      // Create the private bucket
      const { data: newBucket, error: createError } = await supabase.storage.createBucket(bucketName, {
        public: false,
        allowedMimeTypes: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ],
        fileSizeLimit: 10 * 1024 * 1024 // 10MB
      });

      if (createError) {
        throw new Error(`Failed to create bucket: ${createError.message}`);
      }

      console.log(`✅ Created bucket '${bucketName}':`, newBucket);
    }

    // Test upload functionality
    console.log('🧪 Testing upload functionality...');
    
    const testContent = new Uint8Array([65, 66, 67]); // "ABC"
    const testPath = 'test/test-file.txt';
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(testPath, testContent, {
        contentType: 'text/plain',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Test upload failed: ${uploadError.message}`);
    }

    console.log('✅ Test upload successful:', uploadData);

    // Test signed URL generation
    console.log('🔗 Testing signed URL generation...');
    
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(testPath, 60);

    if (signedUrlError) {
      throw new Error(`Signed URL generation failed: ${signedUrlError.message}`);
    }

    console.log('✅ Signed URL generated successfully');
    console.log(`🔗 Test URL: ${signedUrlData.signedUrl.substring(0, 100)}...`);

    // Clean up test file
    const { error: deleteError } = await supabase.storage
      .from(bucketName)
      .remove([testPath]);

    if (deleteError) {
      console.warn('⚠️  Failed to clean up test file:', deleteError.message);
    } else {
      console.log('🧹 Test file cleaned up successfully');
    }

    console.log('\n🎉 Supabase Storage setup completed successfully!');
    console.log(`\n📝 Configuration summary:`);
    console.log(`   - Bucket: ${bucketName} (private)`);
    console.log(`   - Upload: ✅ Working`);
    console.log(`   - Signed URLs: ✅ Working`);
    console.log(`   - File types: PDF, DOC, DOCX`);
    console.log(`   - Size limit: 10MB`);

  } catch (error) {
    console.error('❌ Supabase Storage setup failed:', error);
    process.exit(1);
  }
}

// Run the setup
setupSupabaseStorage();