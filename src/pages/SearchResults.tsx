import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/Navbar';
import PostCard from '@/components/PostCard';
import GuestLoginPrompt from '@/components/GuestLoginPrompt';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ArrowLeft } from 'lucide-react';

const SearchResults = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [search, setSearch] = useState(query);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setPosts([]); return; }
    setLoading(true);

    // Use ilike for case-insensitive partial match
    const searchTerm = `%${q.trim()}%`;
    const { data: postsData } = await supabase
      .from('posts')
      .select('id, title, content, created_at, image_urls, category, status, author_id, type, impressions')
      .or(`title.ilike.${searchTerm},content.ilike.${searchTerm}`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!postsData) { setLoading(false); setPosts([]); return; }

    const authorIds = [...new Set(postsData.map((p: any) => p.author_id).filter(Boolean))];
    const postIds = postsData.map(p => p.id);
    const safePostIds = postIds.length > 0 ? postIds : ['none'];

    const [authorsRes, likesRes, commentsRes] = await Promise.all([
      authorIds.length > 0
        ? supabase.from('profiles_public').select('id, username, is_verified, avatar_url').in('id', authorIds)
        : Promise.resolve({ data: [] }),
      supabase.from('likes').select('post_id, user_id').in('post_id', safePostIds),
      supabase.from('comments').select('post_id').in('post_id', safePostIds),
    ]);

    const authorsById = new Map((authorsRes.data || []).map((a: any) => [a.id, a]));

    const enriched = postsData.map((p: any) => ({
      id: p.id, title: p.title, content: p.content, created_at: p.created_at,
      author: authorsById.get(p.author_id) || { id: p.author_id, username: 'Unknown', is_verified: false, avatar_url: null },
      image_urls: p.image_urls || [], category: p.category, status: p.status, type: p.type,
      impressions: p.impressions || 0,
      likes_count: likesRes.data?.filter(l => l.post_id === p.id).length || 0,
      comments_count: commentsRes.data?.filter(c => c.post_id === p.id).length || 0,
      user_liked: user ? likesRes.data?.some(l => l.post_id === p.id && l.user_id === user.id) || false : false,
    }));

    setPosts(enriched);
    setLoading(false);
  }, [user]);

  useEffect(() => { doSearch(query); }, [query, doSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      setSearchParams({ q: search.trim() });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-2xl px-4 py-6">
        <Link to="/">
          <Button variant="ghost" className="mb-4 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Feed
          </Button>
        </Link>

        <form onSubmit={handleSearch} className="flex items-center gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search posts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <Button type="submit">Search</Button>
        </form>

        {query && (
          <p className="text-sm text-muted-foreground mb-4">
            {loading ? 'Searching...' : `${posts.length} result${posts.length !== 1 ? 's' : ''} for "${query}"`}
          </p>
        )}

        <div className="space-y-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-lg border p-4">
                <Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" />
              </div>
            ))
          ) : posts.length === 0 && query ? (
            <div className="py-16 text-center">
              <p className="text-muted-foreground text-lg">No posts match your search.</p>
            </div>
          ) : (
            posts.map(post => <PostCard key={post.id} post={post} onUpdate={() => doSearch(query)} />)
          )}
        </div>
      </main>
      <GuestLoginPrompt />
    </div>
  );
};

export default SearchResults;
