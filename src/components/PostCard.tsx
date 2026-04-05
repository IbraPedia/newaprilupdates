import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useModRole } from '@/hooks/useModRole';
import { uploadFile, compressImage } from '@/lib/supabaseStorage';
import { containsMiddleFinger, suspendUserForEmoji, checkSuspension } from '@/lib/moderation';
import { formatCompactNumber } from '@/lib/formatNumber';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Heart, MessageCircle, Share2, Send, Bookmark, BookmarkCheck, Pencil, Trash2, X, Check, Flag, Reply, ImagePlus, Video, BadgeCheck, BarChart2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { CATEGORIES } from '@/lib/categories';
import MediaViewer from '@/components/MediaViewer';
import DOMPurify from 'dompurify';

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author: { id: string; username: string; is_verified?: boolean; avatar_url?: string | null };
  likes_count: number;
  comments_count: number;
  user_liked: boolean;
  image_urls?: string[];
  category?: string;
  status?: string;
  type?: string;
  impressions?: number;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author: { id: string; username: string; is_verified?: boolean; avatar_url?: string | null };
  parent_comment_id: string | null;
  media_url: string | null;
  status?: string;
}

const PREVIEW_LENGTH = 140;
const MAX_COMMENT_CHARS = 1000;
const MAX_PREVIEW_THUMBNAILS = 3;
const HTML_CONTENT_REGEX = /<\/?[a-z][\s\S]*>/i;
const INLINE_IMAGE_REGEX = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

const canEditTime = (createdAt: string) => (Date.now() - new Date(createdAt).getTime()) < 12 * 60 * 60 * 1000;
const canDeleteTime = (createdAt: string) => (Date.now() - new Date(createdAt).getTime()) < 48 * 60 * 60 * 1000;

const VerifiedBadge = () => (
  <BadgeCheck className="h-4 w-4 text-blue-500 inline-block ml-0.5 shrink-0" />
);

const isMediaVideo = (url: string) => {
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') || lower.includes('.quicktime') || lower.includes('video');
};

const sanitizeRichContent = (content: string) => DOMPurify.sanitize(content, {
  ALLOWED_TAGS: ['p', 'strong', 'em', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'br', 'img'],
  ALLOWED_ATTR: ['src', 'alt', 'class', 'width', 'height', 'loading', 'decoding'],
});

const htmlToPlainText = (html: string) => {
  const withoutImages = html.replace(/<img[^>]*>/gi, ' ');

  if (typeof window !== 'undefined') {
    const doc = new window.DOMParser().parseFromString(withoutImages, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }

  return withoutImages
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
};

const truncateText = (text: string, maxLength: number) => (
  text.length <= maxLength ? text : `${text.slice(0, maxLength).trimEnd()}…`
);

const extractInlineImageUrls = (html: string) => (
  Array.from(html.matchAll(INLINE_IMAGE_REGEX))
    .map((match) => match[1]?.trim())
    .filter((url): url is string => Boolean(url))
);

const PostCard = ({ post, onUpdate, expanded = false, autoShowComments = false }: { post: Post; onUpdate: () => void; expanded?: boolean; autoShowComments?: boolean }) => {
  const { user } = useAuth();
  const { hasRole: isMod } = useModRole();
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(autoShowComments);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComment, setLoadingComment] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [editingPost, setEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editContent, setEditContent] = useState(post.content);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentContent, setEditCommentContent] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyToUsername, setReplyToUsername] = useState('');
  const [commentMedia, setCommentMedia] = useState<File | null>(null);
  const [commentMediaPreview, setCommentMediaPreview] = useState<string | null>(null);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const [viewerMedia, setViewerMedia] = useState<{ url: string; isVideo: boolean } | null>(null);

  const categoryInfo = CATEGORIES.find(c => c.slug === post.category);
  const isAuthor = user?.id === post.author.id;
  const isPending = post.status === 'pending';

  useEffect(() => {
    if (user) {
      supabase.from('bookmarks').select('id').eq('user_id', user.id).eq('post_id', post.id).maybeSingle()
        .then(({ data }) => setBookmarked(!!data));
    }
  }, [user, post.id]);

  const fetchComments = async () => {
    const { data: rawComments } = await supabase
      .from('comments')
      .select('id, content, created_at, author_id, parent_comment_id, media_url, status')
      .eq('post_id', post.id)
      .order('created_at', { ascending: false });
    if (!rawComments) return;

    const authorIds = [...new Set(rawComments.map((c: any) => c.author_id).filter(Boolean))];
    const { data: authorsData } = authorIds.length > 0
      ? await supabase.from('profiles_public').select('id, username, is_verified, avatar_url').in('id', authorIds)
      : { data: [] };
    const authorsById = new Map((authorsData || []).map((a: any) => [a.id, a]));

    const enriched = rawComments.map((c: any) => ({
      ...c,
      author: authorsById.get(c.author_id) || { id: c.author_id, username: 'Unknown', is_verified: false, avatar_url: null },
    }));
    setComments(enriched);
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
          await supabase.from('notifications').insert({ user_id: post.author.id, type: 'like', actor_id: user.id, post_id: post.id });
        }
      }
      onUpdate();
    } catch { toast.error('Failed to update like'); }
  };

  const removeCommentMedia = () => {
    if (commentMediaPreview) URL.revokeObjectURL(commentMediaPreview);
    setCommentMedia(null);
    setCommentMediaPreview(null);
  };

  const handleCommentMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { toast.error('File must be under 50MB'); return; }
    removeCommentMedia();
    setCommentMedia(file);
    setCommentMediaPreview(URL.createObjectURL(file));
    if (commentFileRef.current) commentFileRef.current.value = '';
  };

  const handleComment = async () => {
    if (!user) { toast.error('Please sign in to comment'); return; }
    if (!newComment.trim() && !commentMedia) return;
    if (newComment.length > MAX_COMMENT_CHARS) { toast.error(`Comment must be under ${MAX_COMMENT_CHARS} characters`); return; }

    // Check for middle finger emoji
    if (containsMiddleFinger(newComment)) {
      // Auto-delete is handled by not inserting; ban user + notify
      try {
        await suspendUserForEmoji(user.id);
        // Notify admins
        supabase.functions.invoke('notify-report', {
          body: { reason: 'User used prohibited emoji (🖕) in a comment. Auto-banned for 14 days.', contentUrl: `${window.location.origin}/post/${post.id}` },
        }).catch(() => {});
      } catch {}
      toast.error('Your account has been suspended for 14 days for using a prohibited emoji.');
      return;
    }

    // Check if user is suspended
    const { suspended, expiresAt } = await checkSuspension(user.id);
    if (suspended) {
      toast.error(`Your account is suspended until ${new Date(expiresAt!).toLocaleDateString()}. You can only read content.`);
      return;
    }
    setLoadingComment(true);
    try {
      let media_url: string | null = null;
      if (commentMedia) {
        if (commentMedia.type.startsWith('image/')) {
          const compressed = await compressImage(commentMedia);
          media_url = await uploadFile(compressed);
        } else {
          media_url = await uploadFile(commentMedia);
        }
      }

      const hasMedia = !!media_url;
      const insertData: any = {
        post_id: post.id,
        author_id: user.id,
        content: newComment.trim(),
        media_url,
        status: hasMedia ? 'pending' : 'approved',
      };
      if (replyToId) insertData.parent_comment_id = replyToId;

      const { data, error } = await supabase.from('comments').insert(insertData).select('id').single();
      if (error) throw error;
      if (post.author.id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: post.author.id, type: 'comment', actor_id: user.id, post_id: post.id, comment_id: data.id,
        });
      }
      setNewComment('');
      setReplyToId(null);
      setReplyToUsername('');
      removeCommentMedia();
      fetchComments();
      onUpdate();
      if (hasMedia) toast.info('Your comment with media is pending admin approval.');
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
        setBookmarked(false); toast.success('Bookmark removed');
      } else {
        await supabase.from('bookmarks').insert({ user_id: user.id, post_id: post.id });
        setBookmarked(true); toast.success('Post bookmarked!');
      }
    } catch { toast.error('Failed to update bookmark'); }
  };

  const handleDeletePost = async () => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    try {
      const { error } = await supabase.from('posts').delete().eq('id', post.id);
      if (error) throw error;
      toast.success('Post deleted'); onUpdate();
    } catch { toast.error('Failed to delete post'); }
  };

  const handleSavePostEdit = async () => {
    if (!editTitle.trim() || !editContent.trim()) { toast.error('Title and content required'); return; }
    try {
      const { error } = await supabase.from('posts').update({ title: editTitle.trim(), content: editContent.trim() }).eq('id', post.id);
      if (error) throw error;
      toast.success('Post updated'); setEditingPost(false); onUpdate();
    } catch { toast.error('Failed to update post'); }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await supabase.from('comments').delete().eq('id', commentId);
      toast.success('Comment deleted'); fetchComments(); onUpdate();
    } catch { toast.error('Failed to delete comment'); }
  };

  const handleSaveCommentEdit = async (commentId: string) => {
    if (!editCommentContent.trim()) return;
    if (editCommentContent.length > MAX_COMMENT_CHARS) { toast.error(`Comment must be under ${MAX_COMMENT_CHARS} characters`); return; }
    try {
      const { error } = await supabase.from('comments').update({ content: editCommentContent.trim() }).eq('id', commentId);
      if (error) throw error;
      toast.success('Comment updated'); setEditingCommentId(null); fetchComments();
    } catch { toast.error('Failed to update comment'); }
  };

  const handleReportPost = async () => {
    if (!user) { toast.error('Please sign in to report'); return; }
    const reason = prompt('Why are you reporting this post?');
    if (!reason?.trim()) return;
    try {
      const { error } = await supabase.from('reports').insert({ reporter_id: user.id, post_id: post.id, reason: reason.trim() });
      if (error) throw error;
      toast.success('Report submitted. Thank you.');
      // Notify admins via email
      const siteUrl = window.location.origin;
      supabase.functions.invoke('notify-report', {
        body: { postId: post.id, reason: reason.trim(), contentUrl: `${siteUrl}/post/${post.id}` },
      }).catch(() => {});
    } catch { toast.error('Failed to submit report'); }
  };

  const handleReportComment = async (commentId: string) => {
    if (!user) return;
    const reason = prompt('Why are you reporting this comment?');
    if (!reason?.trim()) return;
    try {
      const { error } = await supabase.from('reports').insert({ reporter_id: user.id, comment_id: commentId, reason: reason.trim() });
      if (error) throw error;
      toast.success('Report submitted. Thank you.');
      const siteUrl = window.location.origin;
      supabase.functions.invoke('notify-report', {
        body: { commentId, postId: post.id, reason: reason.trim(), contentUrl: `${siteUrl}/post/${post.id}` },
      }).catch(() => {});
    } catch { toast.error('Failed to submit report'); }
  };

  const canEditPost = isMod || (isAuthor && canEditTime(post.created_at));
  const canDeletePost = isMod || (isAuthor && canDeleteTime(post.created_at));

  const isThread = post.type === 'thread';
  const hasRichHtmlContent = isThread || HTML_CONTENT_REGEX.test(post.content);
  const sanitizedRichContent = hasRichHtmlContent ? sanitizeRichContent(post.content) : '';
  const previewSourceText = hasRichHtmlContent ? htmlToPlainText(sanitizedRichContent) : post.content.replace(/\s+/g, ' ').trim();
  const needsTruncation = !expanded && previewSourceText.length > PREVIEW_LENGTH;
  const previewText = truncateText(previewSourceText, PREVIEW_LENGTH);
  const previewImageUrls = !expanded
    ? [...new Set([
        ...(hasRichHtmlContent ? extractInlineImageUrls(sanitizedRichContent) : []),
        ...((post.image_urls || []).filter((url) => !isMediaVideo(url))),
      ])].slice(0, MAX_PREVIEW_THUMBNAILS)
    : [];
  const previewVideoUrls = !expanded
    ? (post.image_urls || []).filter((url) => isMediaVideo(url)).slice(0, 1)
    : [];

  const renderExpandedContent = () => {
    if (hasRichHtmlContent) {
      return sanitizedRichContent;
    }

    return post.content
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  };

  // Build threaded comments
  const topLevelComments = comments.filter(c => !c.parent_comment_id);
  const getReplies = (parentId: string) => comments.filter(c => c.parent_comment_id === parentId);

  const authorDisplay = (
    <div className="flex items-center gap-2">
      {user ? (
        <Link to={`/profile/${post.author.id}`}>
          <Avatar className="h-9 w-9 cursor-pointer hover:ring-2 hover:ring-primary transition-all">
            <AvatarImage src={post.author.avatar_url || undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground font-bold text-sm">
              {post.author.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground font-bold text-sm">
          {post.author.username.charAt(0).toUpperCase()}
        </div>
      )}
      <div>
        <div className="flex items-center gap-0.5">
          {user ? (
            <Link to={`/profile/${post.author.id}`} className="font-semibold text-sm hover:underline">{post.author.username}</Link>
          ) : (
            <p className="font-semibold text-sm">{post.author.username}</p>
          )}
          {post.author.is_verified && <VerifiedBadge />}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
        </p>
      </div>
    </div>
  );

  // Recursive comment rendering for infinite nesting
  const renderCommentTree = (c: Comment, depth: number = 0) => {
    const isCommentAuthor = user?.id === c.author.id;
    const canEditComment = isMod || (isCommentAuthor && canEditTime(c.created_at));
    const canDeleteComment = isMod || (isCommentAuthor && canDeleteTime(c.created_at));
    const isVideo = c.media_url && isMediaVideo(c.media_url);
    const replies = getReplies(c.id);
    const indent = Math.min(depth, 5) * 16;
    const commentIsPending = c.status === 'pending';

    return (
      <div key={c.id} className="space-y-2">
        <div className="flex gap-2" style={{ marginLeft: `${indent}px` }}>
          {user ? (
            <Link to={`/profile/${c.author.id}`}>
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarImage src={c.author.avatar_url || undefined} />
                <AvatarFallback className="bg-secondary text-secondary-foreground font-bold text-xs">
                  {c.author.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-bold text-xs">
              {c.author.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div className={`bg-muted rounded-lg px-3 py-2 flex-1 ${commentIsPending ? 'opacity-60 border border-dashed border-yellow-500' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-0.5">
                {user ? (
                  <Link to={`/profile/${c.author.id}`} className="text-xs font-semibold hover:underline">{c.author.username}</Link>
                ) : (
                  <span className="text-xs font-semibold">{c.author.username}</span>
                )}
                {c.author.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                {commentIsPending && <Badge variant="outline" className="text-[9px] ml-1 h-4 px-1 text-yellow-600">Pending</Badge>}
              </div>
              <div className="flex items-center gap-1">
                {canEditComment && (
                  <button onClick={() => { setEditingCommentId(c.id); setEditCommentContent(c.content); }} className="text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                {canDeleteComment && (
                  <button onClick={() => handleDeleteComment(c.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
                {user && !isCommentAuthor && !isMod && (
                  <button onClick={() => handleReportComment(c.id)} className="text-muted-foreground hover:text-destructive">
                    <Flag className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            {editingCommentId === c.id ? (
              <div className="mt-1 space-y-1">
                <Textarea value={editCommentContent} onChange={e => setEditCommentContent(e.target.value)} rows={2} className="text-sm" maxLength={MAX_COMMENT_CHARS} />
                <p className="text-[10px] text-muted-foreground text-right">{editCommentContent.length}/{MAX_COMMENT_CHARS}</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="default" className="h-6 text-xs" onClick={() => handleSaveCommentEdit(c.id)}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                {c.media_url && (
                  isVideo ? (
                    <video
                      src={c.media_url}
                      controls preload="metadata" playsInline
                      className="w-full rounded max-h-48 mt-1 border cursor-pointer bg-black"
                      onClick={(e) => { e.preventDefault(); setViewerMedia({ url: c.media_url!, isVideo: true }); }}
                    />
                  ) : (
                    <img
                      src={c.media_url}
                      alt=""
                      className="w-full rounded max-h-48 object-cover mt-1 border cursor-pointer hover:opacity-90 transition-opacity"
                      loading="lazy"
                      onClick={() => setViewerMedia({ url: c.media_url!, isVideo: false })}
                    />
                  )
                )}
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </p>
                  {user && (
                    <button
                      onClick={() => { setReplyToId(c.id); setReplyToUsername(c.author.username); }}
                      className="text-[11px] text-muted-foreground hover:text-primary font-medium flex items-center gap-0.5"
                    >
                      <Reply className="h-3 w-3" /> Reply
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {replies.map(reply => renderCommentTree(reply, depth + 1))}
      </div>
    );
  };

  return (
    <Card className={`shadow-card hover:shadow-card-hover transition-shadow ${isPending ? 'border-yellow-500 border-dashed' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          {authorDisplay}
          <div className="flex items-center gap-2">
            {isPending && <Badge variant="outline" className="text-yellow-600">Pending Approval</Badge>}
            {categoryInfo && <Badge variant="secondary" className="text-xs">{categoryInfo.label}</Badge>}
            {(canEditPost || canDeletePost) && (
              <div className="flex items-center gap-1">
                {canEditPost && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingPost(true); setEditTitle(post.title); setEditContent(post.content); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {canDeletePost && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleDeletePost}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
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
          <>
            {expanded ? (
              <div
                className={`text-foreground/90 ${hasRichHtmlContent ? 'prose prose-sm dark:prose-invert max-w-none' : 'whitespace-pre-wrap'}`}
                dangerouslySetInnerHTML={{ __html: renderExpandedContent() }}
              />
            ) : (
              <div className="space-y-3">
                <p className="text-sm leading-6 text-foreground/90 whitespace-pre-wrap break-words">{previewText}</p>
                {previewVideoUrls.length > 0 && (
                  <div className="mt-1">
                    {previewVideoUrls.map((url, index) => (
                      <div
                        key={`vid-${index}`}
                        className="relative aspect-square w-full rounded-lg border overflow-hidden bg-black cursor-pointer group"
                        onClick={() => setViewerMedia({ url, isVideo: true })}
                      >
                        <video
                          src={url}
                          preload="metadata"
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                          <div className="bg-background/80 rounded-full p-3">
                            <Play className="h-6 w-6 text-foreground fill-current" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {previewImageUrls.length > 0 && (
                  <div className={`grid gap-2 ${previewImageUrls.length === 1 ? 'grid-cols-1' : previewImageUrls.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {previewImageUrls.map((url, index) => (
                      <div
                        key={`${url}-${index}`}
                        className="aspect-square rounded-lg border overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setViewerMedia({ url, isVideo: false })}
                      >
                        <img
                          src={url}
                          alt="Post preview"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {needsTruncation && (
              <Link to={`/post/${post.id}`} className="text-primary text-sm font-medium hover:underline">Read more</Link>
            )}
          </>
        )}

        {/* Media - clickable for fullscreen */}
        {expanded && post.image_urls && post.image_urls.length > 0 && (
          <div className={`grid gap-2 ${post.image_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {post.image_urls.map((url, i) =>
              isMediaVideo(url) ? (
                <video
                  key={i} src={url} controls preload="metadata" playsInline
                  className="w-full rounded-lg max-h-64 border cursor-pointer bg-black"
                  onClick={(e) => { e.preventDefault(); setViewerMedia({ url, isVideo: true }); }}
                />
              ) : (
                <img
                  key={i} src={url} alt=""
                  className="w-full rounded-lg object-cover max-h-64 border cursor-pointer hover:opacity-90 transition-opacity"
                  loading="lazy"
                  onClick={() => setViewerMedia({ url, isVideo: false })}
                />
              )
            )}
          </div>
        )}

        <div className="flex items-center gap-1 pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={handleLike} className={`gap-1.5 ${post.user_liked ? 'text-destructive' : ''}`}>
            <Heart className={`h-4 w-4 ${post.user_liked ? 'fill-current' : ''}`} /> {post.likes_count}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowComments(!showComments)} className="gap-1.5">
            <MessageCircle className="h-4 w-4" /> {post.comments_count}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleShare} className="gap-1.5">
            <Share2 className="h-4 w-4" />
          </Button>
          {user && (
            <div className="flex items-center gap-0 ml-auto">
              <Button variant="ghost" size="sm" onClick={handleBookmark} className="gap-1.5">
                {bookmarked ? <BookmarkCheck className="h-4 w-4 fill-current text-primary" /> : <Bookmark className="h-4 w-4" />}
              </Button>
              {!isAuthor && (
                <Button variant="ghost" size="sm" onClick={handleReportPost} className="gap-1.5 text-muted-foreground hover:text-destructive">
                  <Flag className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

        {showComments && (
          <div className="space-y-3 pt-2 border-t">
            {topLevelComments.map((c) => renderCommentTree(c))}
            {user && (
              <div className="space-y-2">
                {replyToId && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                    <Reply className="h-3 w-3" />
                    <span>Replying to <strong>{replyToUsername}</strong></span>
                    <button onClick={() => { setReplyToId(null); setReplyToUsername(''); }} className="ml-auto"><X className="h-3 w-3" /></button>
                  </div>
                )}
                {commentMediaPreview && (
                  <div className="relative group rounded border overflow-hidden inline-block">
                    {commentMedia?.type.startsWith('video/') ? (
                      <video src={commentMediaPreview} controls className="max-h-24" />
                    ) : (
                      <img src={commentMediaPreview} alt="" className="max-h-24 object-cover" />
                    )}
                    <button onClick={removeCommentMedia} className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Textarea
                      placeholder={replyToId ? `Reply to ${replyToUsername}...` : 'Write a comment...'}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      rows={2}
                      maxLength={MAX_COMMENT_CHARS}
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        <input ref={commentFileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={handleCommentMediaSelect} className="hidden" />
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => commentFileRef.current?.click()} disabled={!!commentMedia}>
                          <ImagePlus className="h-3 w-3" /> Photo/Video
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{newComment.length}/{MAX_COMMENT_CHARS}</p>
                    </div>
                  </div>
                  <Button size="icon" onClick={handleComment} disabled={loadingComment || (!newComment.trim() && !commentMedia)} className="shrink-0 self-end">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {viewerMedia && (
        <MediaViewer
          open={!!viewerMedia}
          onClose={() => setViewerMedia(null)}
          url={viewerMedia.url}
          isVideo={viewerMedia.isVideo}
        />
      )}
    </Card>
  );
};

export default PostCard;
