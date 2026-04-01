const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;

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
async function uploadImage(fileBuffer, originalName) {
  if (!supabase) throw new Error('Supabase Storage is not configured');

  const ext = path.extname(originalName).toLowerCase();
  const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const filePath = `products/${uniqueName}`;

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
  const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
  return types[ext] || 'image/jpeg';
}

module.exports = { uploadImage, deleteImage, downloadImage, BUCKET };
