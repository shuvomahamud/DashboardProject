import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with service role key
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseServiceRole) {
  throw new Error('Missing required Supabase environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE');
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
  
  try {
    const { data, error } = await supabaseServer.storage
      .from(bucketName)
      .upload(path, bytes, {
        contentType: options?.contentType || 'application/pdf',
        cacheControl: options?.cacheControl || '3600',
        upsert: options?.upsert || false
      });

    if (error) {
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    return {
      path: data.path,
      fullPath: data.fullPath,
      id: data.id
    };
  } catch (error) {
    console.error('Error uploading resume:', error);
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