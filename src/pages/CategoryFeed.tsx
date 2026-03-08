import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/Navbar';
import PostCard from '@/components/PostCard';
import CreatePostDialog from '@/components/CreatePostDialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { CATEGORIES } from '@/lib/categories';

const CategoryFeed = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const category = CATEGORIES.find(c => c.slug === slug);

  const fetchPosts = useCallback(async () => {
    if (!slug) return;
    const { data: postsData, error: postsError } = await supabase
      .from('posts')
      .select('id, title, content, created_at, image_urls, category, status, author_id')
      .eq('category', slug)
      .order('created_at', { ascending: false });

    if (postsError || !postsData) { setLoading(false); return; }

    const authorIds = [...new Set(postsData.map((p: any) => p.author_id).filter(Boolean))];
    let authorsData: any[] = [];
    if (authorIds.length > 0) {
      const { data } = await supabase
        .from('profiles_public')
        .select('id, username, is_verified, avatar_url')
        .in('id', authorIds);
      authorsData = data || [];
    }
    const authorsById = new Map(authorsData.map((a: any) => [a.id, a]));

    const postIds = postsData.map(p => p.id);
    const { data: likesData } = await supabase.from('likes').select('post_id, user_id').in('post_id', postIds.length > 0 ? postIds : ['none']);
    const { data: commentsData } = await supabase.from('comments').select('post_id').in('post_id', postIds.length > 0 ? postIds : ['none']);

    const enriched = postsData.map((p: any) => ({
      id: p.id, title: p.title, content: p.content, created_at: p.created_at,
      author: authorsById.get(p.author_id) || { id: p.author_id, username: 'Unknown user', is_verified: false, avatar_url: null }, image_urls: p.image_urls || [], category: p.category,
      status: p.status,
      likes_count: likesData?.filter(l => l.post_id === p.id).length || 0,
      comments_count: commentsData?.filter(c => c.post_id === p.id).length || 0,
      user_liked: user ? likesData?.some(l => l.post_id === p.id && l.user_id === user.id) || false : false,
    }));
    setPosts(enriched);
    setLoading(false);
  }, [slug, user]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-2xl px-4 py-6">
        <Link to="/"><Button variant="ghost" className="mb-4 gap-2"><ArrowLeft className="h-4 w-4" /> Back to Feed</Button></Link>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>{category?.label || slug}</h1>
          {user && <CreatePostDialog onPostCreated={fetchPosts} defaultCategory={slug} />}
        </div>
        <div className="space-y-4">
          {loading ? (
            <p className="text-center text-muted-foreground">Loading...</p>
          ) : posts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No posts in this category yet.</p>
          ) : (
            posts.map(post => <PostCard key={post.id} post={post} onUpdate={fetchPosts} />)
          )}
        </div>
      </main>
    </div>
  );
};

export default CategoryFeed;
