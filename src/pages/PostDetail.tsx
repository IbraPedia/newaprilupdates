import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/Navbar';
import PostCard from '@/components/PostCard';
import GuestLoginPrompt from '@/components/GuestLoginPrompt';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PostDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const location = useLocation();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const autoShowComments = location.hash === '#comments';

  const fetchPost = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('posts')
      .select('id, title, content, created_at, image_urls, category, status, author_id')
      .eq('id', id)
      .single();

    if (error || !data) { setLoading(false); return; }

    // Fetch author, likes, comments in parallel
    const [authorRes, likesRes, commentsRes] = await Promise.all([
      (data as any).author_id
        ? supabase.from('profiles_public').select('id, username, is_verified, avatar_url').eq('id', (data as any).author_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('likes').select('user_id').eq('post_id', id),
      supabase.from('comments').select('id').eq('post_id', id),
    ]);

    const author = authorRes.data;
    const likesData = likesRes.data;
    const commentsData = commentsRes.data;

    setPost({
      ...data,
      author: author || { id: (data as any).author_id, username: 'Unknown user', is_verified: false, avatar_url: null },
      image_urls: (data as any).image_urls || [],
      likes_count: likesData?.length || 0,
      comments_count: commentsData?.length || 0,
      user_liked: user ? likesData?.some(l => l.user_id === user.id) || false : false,
    });
    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-2xl px-4 py-6">
        <Link to="/">
          <Button variant="ghost" className="mb-4 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Feed
          </Button>
        </Link>
        {loading ? (
          <p className="text-center text-muted-foreground">Loading...</p>
        ) : post ? (
          <PostCard post={post} onUpdate={fetchPost} expanded autoShowComments={autoShowComments} />
        ) : (
          <p className="text-center text-muted-foreground">Post not found</p>
        )}
      </main>
      <GuestLoginPrompt />
    </div>
  );
};

export default PostDetail;
