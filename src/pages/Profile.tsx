import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/Navbar';
import PostCard from '@/components/PostCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Pencil, Save, X, MapPin, User, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface ProfileData {
  id: string;
  username: string;
  avatar_url: string | null;
  location: string | null;
  gender: string | null;
  age: number | null;
  created_at: string;
}

const Profile = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ username: '', location: '', gender: '', age: '' });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const isOwnProfile = user?.id === id;

  const fetchProfile = async () => {
    if (!id) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
    if (data) {
      setProfile(data as ProfileData);
      setForm({
        username: data.username || '',
        location: (data as any).location || '',
        gender: (data as any).gender || '',
        age: (data as any).age?.toString() || '',
      });
    }
  };

  const fetchPosts = async () => {
    if (!id) return;
    const { data: postsData } = await supabase
      .from('posts')
      .select('*, author:profiles!posts_author_id_fkey(id, username)')
      .eq('author_id', id)
      .order('created_at', { ascending: false });

    if (!postsData) { setLoading(false); return; }

    const postIds = postsData.map(p => p.id);
    const { data: likesData } = await supabase.from('likes').select('post_id, user_id').in('post_id', postIds);
    const { data: commentsData } = await supabase.from('comments').select('post_id').in('post_id', postIds);

    const enriched = postsData.map((p: any) => ({
      id: p.id, title: p.title, content: p.content, created_at: p.created_at,
      author: p.author, image_urls: p.image_urls || [], category: p.category,
      likes_count: likesData?.filter(l => l.post_id === p.id).length || 0,
      comments_count: commentsData?.filter(c => c.post_id === p.id).length || 0,
      user_liked: user ? likesData?.some(l => l.post_id === p.id && l.user_id === user.id) || false : false,
    }));
    setPosts(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchProfile();
    fetchPosts();
  }, [id, user]);

  const handleSave = async () => {
    if (!form.username.trim()) { toast.error('Username is required'); return; }
    setSaving(true);
    try {
      let avatar_url = profile?.avatar_url;
      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop();
        const path = `${user!.id}/avatar.${ext}`;
        await supabase.storage.from('post-images').upload(path, avatarFile, { upsert: true });
        const { data } = supabase.storage.from('post-images').getPublicUrl(path);
        avatar_url = data.publicUrl;
      }
      const { error } = await supabase.from('profiles').update({
        username: form.username.trim(),
        location: form.location.trim() || null,
        gender: form.gender || null,
        age: form.age ? parseInt(form.age) : null,
        avatar_url,
      } as any).eq('id', user!.id);
      if (error) throw error;
      toast.success('Profile updated!');
      setEditing(false);
      setAvatarFile(null);
      fetchProfile();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !profile) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-2xl px-4 py-6">
        <p className="text-center text-muted-foreground">Loading...</p>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-2xl px-4 py-6">
        <Link to="/">
          <Button variant="ghost" className="mb-4 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Feed
          </Button>
        </Link>

        {profile && (
          <Card className="mb-6 shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                      {profile.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle>{profile.username}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Member since {new Date(profile.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {isOwnProfile && !editing && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-3 pt-2">
                  <Input placeholder="Username" value={form.username} onChange={e => setForm({...form, username: e.target.value})} />
                  <Input placeholder="Location (e.g. Dar es Salaam)" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
                  <Select value={form.gender} onValueChange={v => setForm({...form, gender: v})}>
                    <SelectTrigger><SelectValue placeholder="Gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" placeholder="Age" value={form.age} onChange={e => setForm({...form, age: e.target.value})} min={1} max={120} />
                  <div>
                    <label className="text-sm font-medium">Profile Photo</label>
                    <Input type="file" accept="image/*" onChange={e => setAvatarFile(e.target.files?.[0] || null)} className="mt-1" />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                      <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="outline" onClick={() => { setEditing(false); setAvatarFile(null); }} className="gap-1.5">
                      <X className="h-4 w-4" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-4 pt-2 text-sm text-muted-foreground">
                  {profile.location && (
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {profile.location}</span>
                  )}
                  {profile.gender && (
                    <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {profile.gender}</span>
                  )}
                  {profile.age && (
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {profile.age} years</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <h2 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
          {isOwnProfile ? 'Your Posts' : `Posts by ${profile?.username}`}
        </h2>
        <div className="space-y-4">
          {posts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No posts yet.</p>
          ) : (
            posts.map(post => <PostCard key={post.id} post={post} onUpdate={fetchPosts} />)
          )}
        </div>
      </main>
    </div>
  );
};

export default Profile;
