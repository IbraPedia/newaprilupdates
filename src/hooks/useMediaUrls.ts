import { useState, useEffect } from 'react';
import { getR2Urls } from '@/lib/r2Upload';

/**
 * Resolves R2 storage keys to signed URLs.
 * Keys that are already full URLs (legacy Supabase storage) are passed through.
 */
export function useMediaUrls(keys: string[] | null | undefined) {
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!keys || keys.length === 0) { setUrls([]); return; }

    const r2Keys: string[] = [];
    const result: Record<number, string> = {};

    keys.forEach((key, i) => {
      if (key.startsWith('http')) {
        // Legacy Supabase URL — pass through
        result[i] = key;
      } else {
        r2Keys.push(key);
      }
    });

    if (r2Keys.length === 0) {
      setUrls(keys.map((_, i) => result[i]));
      return;
    }

    setLoading(true);
    getR2Urls(r2Keys)
      .then((signedUrls) => {
        let r2Idx = 0;
        const final = keys.map((key, i) => {
          if (result[i]) return result[i];
          return signedUrls[key] || key;
        });
        setUrls(final);
      })
      .catch(() => {
        // Fallback: just use keys as-is
        setUrls(keys);
      })
      .finally(() => setLoading(false));
  }, [keys?.join(',')]);

  return { urls, loading };
}
