import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const getSessionId = (): string => {
  let sid = sessionStorage.getItem('kk_session_id');
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem('kk_session_id', sid);
  }
  return sid;
};

export const useRecordImpression = (postId: string | undefined) => {
  const { user } = useAuth();
  const recorded = useRef(new Set<string>());

  useEffect(() => {
    if (!postId || recorded.current.has(postId)) return;
    recorded.current.add(postId);

    const sessionId = getSessionId();
    Promise.resolve(
      supabase.rpc('record_impression', {
        p_post_id: postId,
        p_viewer_id: user?.id || null,
        p_session_id: user ? null : sessionId,
      } as any)
    ).catch(() => {});
  }, [postId, user]);
};

export const useRecordImpressionsBatch = (postIds: string[]) => {
  const { user } = useAuth();
  const recorded = useRef(new Set<string>());

  useEffect(() => {
    const newIds = postIds.filter(id => !recorded.current.has(id));
    if (newIds.length === 0) return;

    const sessionId = getSessionId();
    newIds.forEach(id => {
      recorded.current.add(id);
      supabase.rpc('record_impression', {
        p_post_id: id,
        p_viewer_id: user?.id || null,
        p_session_id: user ? null : sessionId,
      } as any).then(() => {}).catch(() => {});
    });
  }, [postIds, user]);
};
