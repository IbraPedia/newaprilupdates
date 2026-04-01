import { supabase } from '@/integrations/supabase/client';

// Middle finger emojis in all skin tones
const MIDDLE_FINGER_EMOJIS = ['🖕', '🖕🏻', '🖕🏼', '🖕🏽', '🖕🏾', '🖕🏿'];

/** Check if text contains middle finger emoji */
export function containsMiddleFinger(text: string): boolean {
  return MIDDLE_FINGER_EMOJIS.some(emoji => text.includes(emoji));
}

/** Suspend a user for 14 days (read-only mode) */
export async function suspendUserForEmoji(userId: string): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);

  // Use edge function or admin to insert - for now we'll handle via the content check
  // The suspension record will be created by the system
  await supabase.from('suspensions').insert({
    user_id: userId,
    reason: 'Used prohibited emoji (middle finger)',
    expires_at: expiresAt.toISOString(),
    created_by: 'system',
  } as any);
}

/** Check if user is currently suspended */
export async function checkSuspension(userId: string): Promise<{ suspended: boolean; expiresAt?: string }> {
  const { data } = await supabase
    .from('suspensions')
    .select('expires_at')
    .eq('user_id', userId)
    .gte('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    return { suspended: true, expiresAt: (data[0] as any).expires_at };
  }
  return { suspended: false };
}
