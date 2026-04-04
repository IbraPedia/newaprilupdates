import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface DraftData {
  title: string;
  content: string;
  category: string;
}

export const useDraft = (draftId?: string | null) => {
  const { user } = useAuth();
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId || null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataRef = useRef<DraftData>({ title: '', content: '', category: '' });

  const saveDraft = useCallback(async (data: DraftData) => {
    if (!user) return;
    // Don't save completely empty drafts
    if (!data.title.trim() && !data.content.trim() && !data.category) return;

    setSaving(true);
    try {
      if (currentDraftId) {
        await supabase
          .from('drafts')
          .update({ title: data.title, content: data.content, category: data.category, updated_at: new Date().toISOString() } as any)
          .eq('id', currentDraftId);
      } else {
        const { data: inserted, error } = await supabase
          .from('drafts')
          .insert({ user_id: user.id, title: data.title, content: data.content, category: data.category } as any)
          .select('id')
          .single();
        if (!error && inserted) {
          setCurrentDraftId((inserted as any).id);
        }
      }
      setLastSaved(new Date());
    } catch {
      // Silent fail for auto-save
    } finally {
      setSaving(false);
    }
  }, [user, currentDraftId]);

  const debouncedSave = useCallback((data: DraftData) => {
    latestDataRef.current = data;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveDraft(latestDataRef.current);
    }, 2000);
  }, [saveDraft]);

  const deleteDraft = useCallback(async () => {
    if (!currentDraftId) return;
    await supabase.from('drafts').delete().eq('id', currentDraftId);
    setCurrentDraftId(null);
  }, [currentDraftId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { debouncedSave, deleteDraft, saving, lastSaved, currentDraftId };
};

export const useLatestDraft = () => {
  const { user } = useAuth();
  const [draft, setDraft] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase
      .from('drafts')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setDraft(data);
        setLoading(false);
      });
  }, [user]);

  return { draft, loading };
};
