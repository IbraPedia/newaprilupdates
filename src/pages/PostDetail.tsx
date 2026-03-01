import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/Navbar';
import PostCard from '@/components/PostCard';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PostDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchPost = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('posts')
      .select('*, author:profiles!posts_author_id_fkey(id, username)')
      .eq('id', id)
      .single();

    if (!data) { setLoading(false); return; }

    const { data: likesData } = await supabase
      .from('likes')
      .select('user_id')
      .eq('post_id', id);

    const { data: commentsData } = await supabase
      .from('comments')
      .select('id')
      .eq('post_id', id);

    setPost({
      ...data,
      author: data.author,
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
          <PostCard post={post} onUpdate={fetchPost} />
        ) : (
          <p className="text-center text-muted-foreground">Post not found</p>
        )}
      </main>
    </div>
  );
};

export default PostDetail;
