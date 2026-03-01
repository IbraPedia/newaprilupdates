import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Heart, MessageCircle, Share2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author: { id: string; username: string };
  likes_count: number;
  comments_count: number;
  user_liked: boolean;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author: { id: string; username: string };
}

const PostCard = ({ post, onUpdate }: { post: Post; onUpdate: () => void }) => {
  const { user } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComment, setLoadingComment] = useState(false);

  const fetchComments = async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, author:profiles!comments_author_id_fkey(id, username)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    if (data) setComments(data as any);
  };

  useEffect(() => {
    if (showComments) fetchComments();
  }, [showComments]);

  const handleLike = async () => {
    if (!user) {
      toast.error('Please sign in to like posts');
      return;
    }
    try {
      if (post.user_liked) {
        await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id);
      } else {
        await supabase.from('likes').insert({ post_id: post.id, user_id: user.id });
        // Create notification if not own post
        if (post.author.id !== user.id) {
          await supabase.from('notifications').insert({
            user_id: post.author.id,
            type: 'like',
            actor_id: user.id,
            post_id: post.id,
          });
        }
      }
      onUpdate();
    } catch (err: any) {
      toast.error('Failed to update like');
    }
  };

  const handleComment = async () => {
    if (!user) {
      toast.error('Please sign in to comment');
      return;
    }
    if (!newComment.trim()) return;
    setLoadingComment(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({ post_id: post.id, author_id: user.id, content: newComment.trim() })
        .select('id')
        .single();
      if (error) throw error;
      // Create notification if not own post
      if (post.author.id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: post.author.id,
          type: 'comment',
          actor_id: user.id,
          post_id: post.id,
          comment_id: data.id,
        });
      }
      setNewComment('');
      fetchComments();
      onUpdate();
    } catch (err: any) {
      toast.error('Failed to post comment');
    } finally {
      setLoadingComment(false);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/post/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard!');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  return (
    <Card className="shadow-card hover:shadow-card-hover transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
              {post.author.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-sm">{post.author.username}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>
        </div>
        <h3 className="text-lg font-bold mt-2" style={{ fontFamily: 'var(--font-heading)' }}>
          {post.title}
        </h3>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-foreground/90 whitespace-pre-wrap">{post.content}</p>

        <div className="flex items-center gap-1 pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLike}
            className={`gap-1.5 ${post.user_liked ? 'text-destructive' : ''}`}
          >
            <Heart className={`h-4 w-4 ${post.user_liked ? 'fill-current' : ''}`} />
            {post.likes_count}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowComments(!showComments)}
            className="gap-1.5"
          >
            <MessageCircle className="h-4 w-4" />
            {post.comments_count}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleShare} className="gap-1.5 ml-auto">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </div>

        {showComments && (
          <div className="space-y-3 pt-2 border-t">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground font-bold text-xs">
                  {c.author.username.charAt(0).toUpperCase()}
                </div>
                <div className="bg-muted rounded-lg px-3 py-2 flex-1">
                  <p className="text-xs font-semibold">{c.author.username}</p>
                  <p className="text-sm">{c.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
            {user && (
              <div className="flex gap-2">
                <Textarea
                  placeholder="Write a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={2}
                  className="flex-1"
                />
                <Button
                  size="icon"
                  onClick={handleComment}
                  disabled={loadingComment || !newComment.trim()}
                  className="shrink-0 self-end"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PostCard;
