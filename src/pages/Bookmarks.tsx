import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/Navbar';
import PostCard from '@/components/PostCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const Bookmarks = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookmarks = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data: bookmarks } = await supabase
      .from('bookmarks')
      .select('post_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!bookmarks || bookmarks.length === 0) { setPosts([]); setLoading(false); return; }

    const postIds = bookmarks.map(b => b.post_id);
    const { data: postsData } = await supabase
      .from('posts')
      .select('*, author:profiles!posts_author_id_fkey(id, username)')
      .in('id', postIds);

    if (!postsData) { setLoading(false); return; }

    const { data: likesData } = await supabase.from('likes').select('post_id, user_id').in('post_id', postIds);
    const { data: commentsData } = await supabase.from('comments').select('post_id').in('post_id', postIds);

    const enriched = postsData.map((p: any) => ({
      id: p.id, title: p.title, content: p.content, created_at: p.created_at,
      author: p.author, image_urls: p.image_urls || [], category: p.category,
      likes_count: likesData?.filter(l => l.post_id === p.id).length || 0,
      comments_count: commentsData?.filter(c => c.post_id === p.id).length || 0,
      user_liked: likesData?.some(l => l.post_id === p.id && l.user_id === user.id) || false,
    }));
    // Maintain bookmark order
    const ordered = postIds.map(id => enriched.find(p => p.id === id)).filter(Boolean);
    setPosts(ordered);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchBookmarks(); }, [fetchBookmarks]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-2xl px-4 py-6">
        <Link to="/">
          <Button variant="ghost" className="mb-4 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Feed
          </Button>
        </Link>
        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-heading)' }}>
          Bookmarked Posts
        </h1>
        <div className="space-y-4">
          {loading ? (
            <p className="text-center text-muted-foreground">Loading...</p>
          ) : posts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No bookmarked posts yet.</p>
          ) : (
            posts.map(post => <PostCard key={post.id} post={post} onUpdate={fetchBookmarks} />)
          )}
        </div>
      </main>
    </div>
  );
};

export default Bookmarks;
