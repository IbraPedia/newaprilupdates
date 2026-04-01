import { supabase } from '@/integrations/supabase/client';

/** Compress an image file to WebP format, targeting ~50KB for mobile-friendly loading */
export async function compressImage(file: File, targetSizeKB = 50): Promise<File> {
  // Skip non-image files
  if (!file.type.startsWith('image/')) return file;
  // Already small enough
  if (file.size <= targetSizeKB * 1024) {
    // Still convert to WebP for consistency
    return convertToWebP(file, 0.85);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      // Scale down large images
      const MAX_DIM = 1600;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      // Binary search for best quality that stays under target
      let lo = 0.1, hi = 0.85, bestBlob: Blob | null = null;

      const tryQuality = (quality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }

            if (blob.size <= targetSizeKB * 1024) {
              bestBlob = blob;
              lo = quality;
            } else {
              hi = quality;
            }

            if (hi - lo > 0.05) {
              tryQuality((lo + hi) / 2);
            } else {
              const finalBlob = bestBlob || blob;
              const name = file.name.replace(/\.[^.]+$/, '.webp');
              resolve(new File([finalBlob], name, { type: 'image/webp' }));
            }
          },
          'image/webp',
          quality
        );
      };

      tryQuality(0.5);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

/** Convert an image to WebP at a given quality */
async function convertToWebP(file: File, quality: number): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const name = file.name.replace(/\.[^.]+$/, '.webp');
            resolve(new File([blob], name, { type: 'image/webp' }));
          } else {
            resolve(file);
          }
        },
        'image/webp',
        quality
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

/** Upload a file to Supabase Storage and return the public URL */
export async function uploadFile(file: File, bucket: string = 'post-images'): Promise<string> {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
