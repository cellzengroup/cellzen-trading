const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_OPTIONS = {
  public: true,
  fileSizeLimit: MAX_FILE_SIZE_BYTES,
  allowedMimeTypes: ALLOWED_MIME_TYPES,
};

let supabase = null;
let bucketReady = false;

if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
  console.log('✅ Supabase Storage client initialized');
} else {
  console.warn('⚠️ SUPABASE_URL or SUPABASE_SERVICE_KEY not set — image uploads will be disabled.');
}

/**
 * Upload an image buffer to Supabase Storage.
 * Returns the public URL on success, or null on failure.
 */
async function uploadStorageFile(fileBuffer, originalName, folder = 'products') {
  if (!supabase) throw new Error('Supabase Storage is not configured');

  const ext = path.extname(originalName).toLowerCase();
  const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const filePath = `${folder}/${uniqueName}`;

  await ensureBucketReady();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, fileBuffer, {
      contentType: getMimeType(ext),
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

// Singleton in-flight promise so concurrent first-uploads don't all run the
// bucket setup in parallel (which used to trigger 3+ admin API round-trips per
// caller on cold start).
let bucketReadyPromise = null;

async function ensureBucketReady() {
  if (bucketReady) return;
  if (bucketReadyPromise) return bucketReadyPromise;

  bucketReadyPromise = (async () => {
    const { data: bucket, error: getBucketError } = await supabase.storage.getBucket(BUCKET);
    if (!getBucketError && bucket) {
      // Bucket already exists — don't re-PUT its config on every cold start.
      // Those updateBucket / updateBucketViaStorageApi calls used to add ~2
      // round-trips of latency to the first upload after the server woke up.
      bucketReady = true;
      return;
    }

    // Bucket doesn't exist yet — create it and set the limits once.
    const { error: createBucketError } = await supabase.storage.createBucket(BUCKET, BUCKET_OPTIONS);
    if (createBucketError) throw createBucketError;
    await updateBucketViaStorageApi();
    bucketReady = true;
  })();

  try {
    await bucketReadyPromise;
  } finally {
    bucketReadyPromise = null;
  }
}

async function updateBucketViaStorageApi() {
  const response = await fetch(`${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(BUCKET)}`, {
    method: 'PUT',
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      public: true,
      file_size_limit: MAX_FILE_SIZE_BYTES,
      allowed_mime_types: ALLOWED_MIME_TYPES,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to update Supabase bucket file size limit: ${message}`);
  }
}

async function uploadImage(fileBuffer, originalName) {
  return uploadStorageFile(fileBuffer, originalName, 'products');
}

async function uploadPdf(fileBuffer, originalName) {
  return uploadStorageFile(fileBuffer, originalName, 'product-pdfs');
}

/**
 * Create a signed upload URL the browser can PUT to directly. Eliminates the
 * proxy-through-the-backend hop, which on Render free tier was the dominant
 * latency cost for image uploads.
 *
 * Returns: { signedUrl, publicUrl, path } — caller PUTs the file bytes to
 * `signedUrl`, then stores `publicUrl` on the DB row.
 */
async function createSignedImageUpload(originalName, folder = 'products') {
  if (!supabase) throw new Error('Supabase Storage is not configured');

  await ensureBucketReady();

  const ext = path.extname(originalName || '').toLowerCase() || '.jpg';
  const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const filePath = `${folder}/${uniqueName}`;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(filePath);
  if (error) throw error;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: filePath,
    publicUrl: pub.publicUrl,
  };
}

/**
 * Delete an image from Supabase Storage by its public URL.
 */
async function deleteImage(publicUrl) {
  if (!supabase || !publicUrl) return;

  // Extract the storage path from the public URL
  // URL format: https://<project>.supabase.co/storage/v1/object/public/<bucket>/products/filename.jpg
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return; // not a Supabase Storage URL

  const filePath = publicUrl.substring(idx + marker.length);
  await supabase.storage.from(BUCKET).remove([filePath]);
}

/**
 * Download an image by its URL and return the buffer.
 * Handles: Supabase storage URLs, any http(s) URL, and legacy local /uploads/ paths.
 */
async function downloadImage(publicUrl) {
  if (!publicUrl) return null;

  // For Supabase URLs, use the storage API (faster, authenticated)
  if (supabase && publicUrl.includes('supabase')) {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx !== -1) {
      const filePath = publicUrl.substring(idx + marker.length);
      const { data, error } = await supabase.storage.from(BUCKET).download(filePath);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    }
  }

  // Fallback: fetch any http(s) URL
  if (publicUrl.startsWith('http')) {
    try {
      const response = await fetch(publicUrl);
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch { return null; }
  }

  // Legacy: local /uploads/ path — read from disk if file exists
  if (publicUrl.startsWith('/uploads/')) {
    const fs = require('fs');
    const localPath = path.join(__dirname, '..', publicUrl);
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
  }

  return null;
}

function getMimeType(ext) {
  const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf' };
  return types[ext] || 'image/jpeg';
}

module.exports = { uploadImage, uploadPdf, createSignedImageUpload, deleteImage, downloadImage, BUCKET };
