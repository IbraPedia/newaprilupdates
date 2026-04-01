import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
  post_id: string;
  actor_id: string;
  actor_username?: string;
  post_title?: string;
}

const NotificationDropdown = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('id, type, read, created_at, post_id, actor_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (!data || data.length === 0) { setNotifications([]); return; }

    // Fetch actor usernames and post titles in parallel
    const actorIds = [...new Set(data.map(n => n.actor_id).filter(Boolean))];
    const postIds = [...new Set(data.map(n => n.post_id).filter(Boolean))];

    const [actorsRes, postsRes] = await Promise.all([
      actorIds.length > 0
        ? supabase.from('profiles_public').select('id, username').in('id', actorIds)
        : Promise.resolve({ data: [] }),
      postIds.length > 0
        ? supabase.from('posts').select('id, title').in('id', postIds)
        : Promise.resolve({ data: [] }),
    ]);

    const actorsMap = new Map((actorsRes.data || []).map((a: any) => [a.id, a.username]));
    const postsMap = new Map((postsRes.data || []).map((p: any) => [p.id, p.title]));

    const enriched: Notification[] = data.map((n: any) => ({
      ...n,
      actor_username: actorsMap.get(n.actor_id) || 'Someone',
      post_title: postsMap.get(n.post_id) || 'a post',
    }));

    setNotifications(enriched);
  };

  useEffect(() => {
    fetchNotifications();
    
    if (!user) return;
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => fetchNotifications())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
    fetchNotifications();
  };

  const handleClick = async (n: Notification) => {
    if (!n.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', n.id);
      fetchNotifications();
    }
    setOpen(false);
    navigate(`/post/${n.post_id}#comments`);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b p-3">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No notifications yet</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left border-b p-3 text-sm hover:bg-accent/50 transition-colors ${!n.read ? 'bg-secondary/50' : ''}`}
              >
                <p>
                  <span className="font-semibold">{n.actor_username}</span>{' '}
                  {n.type === 'like' ? 'liked' : 'commented on'}{' '}
                  <span className="font-medium">"{n.post_title}"</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationDropdown;
