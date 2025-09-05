import { createClient } from '@supabase/supabase-js';
import { inferContentType } from '../files/resumeFiles';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE!;
const resumesBucket = process.env.SUPABASE_RESUMES_BUCKET || 'resumes';

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration');
}

// Create Supabase client with service role key for server-side operations
const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export async function uploadResume(
  bytes: Uint8Array,
  path: string
): Promise<{ path: string }> {
  const contentType = inferContentType(path);
  
  const { data, error } = await supabaseServer.storage
    .from(resumesBucket)
    .upload(path, bytes, {
      upsert: false,
      contentType,
      cacheControl: '3600'
    });

  if (error) {
    throw new Error(`Failed to upload resume: ${error.message}`);
  }

  if (!data) {
    throw new Error('Upload failed: no data returned');
  }

  return { path: data.path };
}

export async function getSignedUrl(
  path: string,
  expiresSec: number = 60
): Promise<string> {
  const { data, error } = await supabaseServer.storage
    .from(resumesBucket)
    .createSignedUrl(path, expiresSec);

  if (error) {
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }

  if (!data?.signedUrl) {
    throw new Error('Failed to create signed URL: no URL returned');
  }

  return data.signedUrl;
}

export async function fileExists(path: string): Promise<boolean> {
  const { data, error } = await supabaseServer.storage
    .from(resumesBucket)
    .list(path.substring(0, path.lastIndexOf('/')), {
      search: path.substring(path.lastIndexOf('/') + 1)
    });

  if (error) {
    return false;
  }

  return data.some(file => file.name === path.substring(path.lastIndexOf('/') + 1));
}

export { supabaseServer };