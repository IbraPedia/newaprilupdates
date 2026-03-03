import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMediaUrls } from '@/hooks/useMediaUrls';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Heart, MessageCircle, Share2, Send, Bookmark, BookmarkCheck, Eye, Pencil, Trash2, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { CATEGORIES } from '@/lib/categories';

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author: { id: string; username: string };
  likes_count: number;
  comments_count: number;
  user_liked: boolean;
  image_urls?: string[];
  category?: string;
  views?: number;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author: { id: string; username: string };
}

const canEdit = (createdAt: string) => {
  return (Date.now() - new Date(createdAt).getTime()) < 12 * 60 * 60 * 1000;
};

const PostCard = ({ post, onUpdate }: { post: Post; onUpdate: () => void }) => {
  const { user } = useAuth();
  const { urls: mediaUrls } = useMediaUrls(post.image_urls);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComment, setLoadingComment] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [editingPost, setEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editContent, setEditContent] = useState(post.content);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentContent, setEditCommentContent] = useState('');

  const categoryInfo = CATEGORIES.find(c => c.slug === post.category);
  const isAuthor = user?.id === post.author.id;

  useEffect(() => {
    if (user) {
      supabase.from('bookmarks').select('id').eq('user_id', user.id).eq('post_id', post.id).maybeSingle()
        .then(({ data }) => setBookmarked(!!data));
    }
  }, [user, post.id]);

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
    if (!user) { toast.error('Please sign in to like posts'); return; }
    try {
      if (post.user_liked) {
        await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id);
      } else {
        await supabase.from('likes').insert({ post_id: post.id, user_id: user.id });
        if (post.author.id !== user.id) {
          await supabase.from('notifications').insert({
            user_id: post.author.id, type: 'like', actor_id: user.id, post_id: post.id,
          });
        }
      }
      onUpdate();
    } catch { toast.error('Failed to update like'); }
  };

  const handleComment = async () => {
    if (!user) { toast.error('Please sign in to comment'); return; }
    if (!newComment.trim()) return;
    setLoadingComment(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({ post_id: post.id, author_id: user.id, content: newComment.trim() })
        .select('id').single();
      if (error) throw error;
      if (post.author.id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: post.author.id, type: 'comment', actor_id: user.id, post_id: post.id, comment_id: data.id,
        });
      }
      setNewComment('');
      fetchComments();
      onUpdate();
    } catch { toast.error('Failed to post comment'); }
    finally { setLoadingComment(false); }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/post/${post.id}`;
    try { await navigator.clipboard.writeText(url); toast.success('Link copied!'); }
    catch { toast.error('Failed to copy link'); }
  };

  const handleBookmark = async () => {
    if (!user) { toast.error('Please sign in to bookmark'); return; }
    try {
      if (bookmarked) {
        await supabase.from('bookmarks').delete().eq('user_id', user.id).eq('post_id', post.id);
        setBookmarked(false);
        toast.success('Bookmark removed');
      } else {
        await supabase.from('bookmarks').insert({ user_id: user.id, post_id: post.id });
        setBookmarked(true);
        toast.success('Post bookmarked!');
      }
    } catch { toast.error('Failed to update bookmark'); }
  };

  const handleDeletePost = async () => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    try {
      const { error } = await supabase.from('posts').delete().eq('id', post.id);
      if (error) throw error;
      toast.success('Post deleted');
      onUpdate();
    } catch { toast.error('Failed to delete post'); }
  };

  const handleSavePostEdit = async () => {
    if (!editTitle.trim() || !editContent.trim()) { toast.error('Title and content required'); return; }
    try {
      const { error } = await supabase.from('posts').update({
        title: editTitle.trim(), content: editContent.trim(),
      }).eq('id', post.id);
      if (error) throw error;
      toast.success('Post updated');
      setEditingPost(false);
      onUpdate();
    } catch { toast.error('Failed to update post'); }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await supabase.from('comments').delete().eq('id', commentId);
      toast.success('Comment deleted');
      fetchComments();
      onUpdate();
    } catch { toast.error('Failed to delete comment'); }
  };

  const handleSaveCommentEdit = async (commentId: string) => {
    if (!editCommentContent.trim()) return;
    try {
      const { error } = await supabase.from('comments').update({ content: editCommentContent.trim() }).eq('id', commentId);
      if (error) throw error;
      toast.success('Comment updated');
      setEditingCommentId(null);
      fetchComments();
    } catch { toast.error('Failed to update comment'); }
  };

  const authorDisplay = (
    <div className="flex items-center gap-2">
      {user ? (
        <Link to={`/profile/${post.author.id}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm hover:opacity-80">
          {post.author.username.charAt(0).toUpperCase()}
        </Link>
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground font-bold text-sm">
          {post.author.username.charAt(0).toUpperCase()}
        </div>
      )}
      <div>
        {user ? (
          <Link to={`/profile/${post.author.id}`} className="font-semibold text-sm hover:underline">{post.author.username}</Link>
        ) : (
          <p className="font-semibold text-sm">{post.author.username}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
        </p>
      </div>
    </div>
  );

  return (
    <Card className="shadow-card hover:shadow-card-hover transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          {authorDisplay}
          <div className="flex items-center gap-2">
            {categoryInfo && (
              <Badge variant="secondary" className="text-xs">{categoryInfo.label}</Badge>
            )}
            {isAuthor && (
              <div className="flex items-center gap-1">
                {canEdit(post.created_at) && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingPost(true); setEditTitle(post.title); setEditContent(post.content); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleDeletePost}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
        {editingPost ? (
          <div className="space-y-2 mt-2">
            <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Title" />
            <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={4} />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSavePostEdit} className="gap-1"><Check className="h-3.5 w-3.5" /> Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditingPost(false)} className="gap-1"><X className="h-3.5 w-3.5" /> Cancel</Button>
            </div>
          </div>
        ) : (
          <h3 className="text-lg font-bold mt-2" style={{ fontFamily: 'var(--font-heading)' }}>{post.title}</h3>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!editingPost && (
          <p className="text-foreground/90 whitespace-pre-wrap"
            dangerouslySetInnerHTML={{
              __html: post.content
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
            }}
          />
        )}

        {mediaUrls.length > 0 && (
          <div className={`grid gap-2 ${mediaUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {mediaUrls.map((url, i) => {
              const isVideo = url.includes('.mp4') || url.includes('.webm') || url.includes('.mov') || url.includes('video');
              return isVideo ? (
                <video key={i} src={url} controls className="w-full rounded-lg max-h-64 border" />
              ) : (
                <img key={i} src={url} alt="" className="w-full rounded-lg object-cover max-h-64 border" loading="lazy" />
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-1 pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={handleLike} className={`gap-1.5 ${post.user_liked ? 'text-destructive' : ''}`}>
            <Heart className={`h-4 w-4 ${post.user_liked ? 'fill-current' : ''}`} />
            {post.likes_count}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowComments(!showComments)} className="gap-1.5">
            <MessageCircle className="h-4 w-4" />
            {post.comments_count}
          </Button>
          <span className="flex items-center gap-1 text-xs text-muted-foreground px-2">
            <Eye className="h-3.5 w-3.5" />
            {post.views || 0}
          </span>
          <Button variant="ghost" size="sm" onClick={handleShare} className="gap-1.5">
            <Share2 className="h-4 w-4" />
          </Button>
          {user && (
            <Button variant="ghost" size="sm" onClick={handleBookmark} className="gap-1.5 ml-auto">
              {bookmarked ? <BookmarkCheck className="h-4 w-4 fill-current text-primary" /> : <Bookmark className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {showComments && (
          <div className="space-y-3 pt-2 border-t">
            {comments.map((c) => {
              const isCommentAuthor = user?.id === c.author.id;
              return (
                <div key={c.id} className="flex gap-2">
                  {user ? (
                    <Link to={`/profile/${c.author.id}`}>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground font-bold text-xs">
                        {c.author.username.charAt(0).toUpperCase()}
                      </div>
                    </Link>
                  ) : (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-bold text-xs">
                      {c.author.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="bg-muted rounded-lg px-3 py-2 flex-1">
                    <div className="flex items-center justify-between">
                      {user ? (
                        <Link to={`/profile/${c.author.id}`} className="text-xs font-semibold hover:underline">{c.author.username}</Link>
                      ) : (
                        <span className="text-xs font-semibold">{c.author.username}</span>
                      )}
                      {isCommentAuthor && (
                        <div className="flex items-center gap-1">
                          {canEdit(c.created_at) && (
                            <button onClick={() => { setEditingCommentId(c.id); setEditCommentContent(c.content); }} className="text-muted-foreground hover:text-foreground">
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          <button onClick={() => handleDeleteComment(c.id)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    {editingCommentId === c.id ? (
                      <div className="mt-1 space-y-1">
                        <Textarea value={editCommentContent} onChange={e => setEditCommentContent(e.target.value)} rows={2} className="text-sm" />
                        <div className="flex gap-1">
                          <Button size="sm" variant="default" className="h-6 text-xs" onClick={() => handleSaveCommentEdit(c.id)}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm">{c.content}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {user && (
              <div className="flex gap-2">
                <Textarea placeholder="Write a comment..." value={newComment} onChange={(e) => setNewComment(e.target.value)} rows={2} className="flex-1" />
                <Button size="icon" onClick={handleComment} disabled={loadingComment || !newComment.trim()} className="shrink-0 self-end">
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
