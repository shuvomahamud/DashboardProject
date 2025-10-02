import { createClient } from '@supabase/supabase-js';

// Validate environment variables
function reqEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Server-side Supabase client with service role key
const supabaseUrl = reqEnv('SUPABASE_URL');
const supabaseServiceRole = reqEnv('SUPABASE_SERVICE_ROLE');

// Log masked URL for debugging (only first time)
if (!global.__supabaseLogged) {
  console.log('Supabase URL (masked):', supabaseUrl.slice(0, 25), '...');
  global.__supabaseLogged = true;

  // Canary health check with API key
  fetch(`${supabaseUrl}/auth/v1/health`, {
    headers: {
      'apikey': supabaseServiceRole,
      'Authorization': `Bearer ${supabaseServiceRole}`
    }
  })
    .then(r => r.text())
    .then(text => console.log('Supabase health check:', text.slice(0, 50)))
    .catch(e => console.warn('Supabase health check failed:', e.message));
}

export const supabaseServer = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Helper function to upload resume bytes to Supabase storage
export async function uploadResumeBytes(
  path: string,
  bytes: Buffer | Uint8Array | File,
  options?: {
    contentType?: string;
    cacheControl?: string;
    upsert?: boolean;
  }
) {
  const bucketName = process.env.SUPABASE_RESUME_BUCKET || process.env.SUPABASE_RESUMES_BUCKET || 'resumes';

  // Validate bucket name
  if (!bucketName) {
    throw new Error('Resume bucket name not configured in environment variables');
  }

  try {
    const { data, error } = await supabaseServer.storage
      .from(bucketName)
      .upload(path, bytes, {
        contentType: options?.contentType || 'application/pdf',
        cacheControl: options?.cacheControl || '3600',
        upsert: options?.upsert || false
      });

    if (error) {
      console.error('Supabase storage error:', error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    if (!data) {
      throw new Error('Upload succeeded but no data returned');
    }

    return {
      path: data.path,
      fullPath: data.fullPath,
      id: data.id
    };
  } catch (error) {
    console.error('Error uploading resume:', error);

    // Enhanced error logging for debugging
    if (error instanceof Error) {
      console.error('Upload error details:', {
        message: error.message,
        stack: error.stack,
        bucketName,
        pathLength: path.length,
        bytesSize: bytes instanceof Buffer ? bytes.length : bytes.byteLength || 'unknown'
      });
    }

    throw error;
  }
}

// Helper function to create signed URL for private files
export async function createSignedUrl(
  bucketName: string,
  path: string,
  expiresIn: number = 60 // seconds
) {
  try {
    const { data, error } = await supabaseServer.storage
      .from(bucketName)
      .createSignedUrl(path, expiresIn);

    if (error) {
      throw new Error(`Failed to create signed URL: ${error.message}`);
    }

    return data.signedUrl;
  } catch (error) {
    console.error('Error creating signed URL:', error);
    throw error;
  }
}

// Helper function to get public URL for public files
export function getPublicUrl(bucketName: string, path: string) {
  const { data } = supabaseServer.storage
    .from(bucketName)
    .getPublicUrl(path);
  
  return data.publicUrl;
}

// Helper function to delete file from storage
export async function deleteFile(bucketName: string, path: string) {
  try {
    const { error } = await supabaseServer.storage
      .from(bucketName)
      .remove([path]);

    if (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }

    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
}

// Helper function to list files in a bucket
export async function listFiles(
  bucketName: string, 
  path?: string,
  options?: {
    limit?: number;
    offset?: number;
    sortBy?: { column: string; order: 'asc' | 'desc' };
  }
) {
  try {
    const { data, error } = await supabaseServer.storage
      .from(bucketName)
      .list(path, options);

    if (error) {
      throw new Error(`Failed to list files: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
}