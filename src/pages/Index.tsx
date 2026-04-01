import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/Navbar';
import PostCard from '@/components/PostCard';
import CreatePostDialog from '@/components/CreatePostDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

interface PostData {
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
}

const POSTS_PER_PAGE = 30;

const Index = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<PostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(POSTS_PER_PAGE);

  const fetchPosts = useCallback(async () => {
    const { data: postsData, error: postsError } = await supabase
      .from('posts')
      .select('id, title, content, created_at, image_urls, category, status, author_id')
      .order('created_at', { ascending: false });

    if (postsError || !postsData) { setLoading(false); return; }

    const authorIds = [...new Set(postsData.map((p: any) => p.author_id).filter(Boolean))];
    const postIds = postsData.map(p => p.id);
    const safePostIds = postIds.length > 0 ? postIds : ['none'];

    // Fetch profiles, likes, comments in parallel
    const [authorsRes, likesRes, commentsRes] = await Promise.all([
      authorIds.length > 0
        ? supabase.from('profiles_public').select('id, username, is_verified, avatar_url').in('id', authorIds)
        : Promise.resolve({ data: [] }),
      supabase.from('likes').select('post_id, user_id').in('post_id', safePostIds),
      supabase.from('comments').select('post_id').in('post_id', safePostIds),
    ]);

    const authorsById = new Map((authorsRes.data || []).map((a: any) => [a.id, a]));
    const likesData = likesRes.data;
    const commentsData = commentsRes.data;

    const enriched: PostData[] = postsData.map((p: any) => ({
      id: p.id, title: p.title, content: p.content, created_at: p.created_at,
      author: authorsById.get(p.author_id) || { id: p.author_id, username: 'Unknown user', is_verified: false, avatar_url: null }, image_urls: p.image_urls || [], category: p.category,
      status: p.status,
      likes_count: likesData?.filter(l => l.post_id === p.id).length || 0,
      comments_count: commentsData?.filter(c => c.post_id === p.id).length || 0,
      user_liked: user ? likesData?.some(l => l.post_id === p.id && l.user_id === user.id) || false : false,
    }));

    // Sorting: recent first, then engagement, verified boost for 23h only
    const now = Date.now();
    const VERIFIED_BOOST_MS = 23 * 60 * 60 * 1000;

    const sorted = [...enriched].sort((a, b) => {
      const getScore = (p: PostData) => {
        const recency = new Date(p.created_at).getTime();
        const engagement = (p.likes_count + p.comments_count) * 1800000; // 30min boost per interaction
        const postAge = now - new Date(p.created_at).getTime();
        const verifiedBoost = p.author.is_verified && postAge < VERIFIED_BOOST_MS
          ? (VERIFIED_BOOST_MS - postAge) : 0;
        return recency + engagement + verifiedBoost;
      };
      return getScore(b) - getScore(a);
    });

    setPosts(sorted);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  useEffect(() => {
    const channel = supabase
      .channel('public:posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => fetchPosts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchPosts]);

  const filtered = search.trim()
    ? posts.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || p.content.toLowerCase().includes(search.toLowerCase()))
    : posts;

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search posts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-lg border p-4">
                <Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" />
              </div>
            ))
          ) : visible.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-muted-foreground text-lg">
                {search ? 'No posts match your search.' : 'No posts yet. Be the first to share!'}
              </p>
            </div>
          ) : (
            <>
              {visible.map((post) => <PostCard key={post.id} post={post} onUpdate={fetchPosts} />)}
              {hasMore && (
                <div className="text-center py-4">
                  <Button variant="outline" onClick={() => setVisibleCount(v => v + POSTS_PER_PAGE)}>See More</Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Floating Create Post Button */}
      {user && (
        <div className="fixed bottom-6 right-6 z-50">
          <CreatePostDialog onPostCreated={fetchPosts} />
        </div>
      )}
    </div>
  );
};

export default Index;
