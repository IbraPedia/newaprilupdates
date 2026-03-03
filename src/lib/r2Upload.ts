import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function callR2Function(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/r2-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

/** Compress an image file to max ~1MB using canvas */
export async function compressImage(file: File, maxSizeKB = 1024): Promise<File> {
  if (file.size <= maxSizeKB * 1024) return file;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      // Scale down if very large
      const MAX_DIM = 1920;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        0.8
      );
    };
    img.src = URL.createObjectURL(file);
  });
}

/** Upload a file to R2 and return the storage key */
export async function uploadToR2(file: File): Promise<string> {
  const { uploadUrl, key } = await callR2Function({
    action: 'presign-upload',
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  });

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!uploadRes.ok) throw new Error('Failed to upload file to storage');
  return key;
}

/** Get a signed download URL for one key */
export async function getR2Url(key: string): Promise<string> {
  const { downloadUrl } = await callR2Function({
    action: 'presign-download',
    key,
  });
  return downloadUrl;
}

/** Get signed download URLs for multiple keys */
export async function getR2Urls(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const { urls } = await callR2Function({
    action: 'presign-downloads',
    keys,
  });
  return urls;
}
