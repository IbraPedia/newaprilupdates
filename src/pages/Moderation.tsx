import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Trash2, CheckCircle, XCircle, UserPlus, UserMinus, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface Report {
  id: string;
  reason: string;
  status: string;
  created_at: string;
  post_id: string | null;
  comment_id: string | null;
  reporter_id: string;
  reporter?: { username: string };
  post?: { title: string; content: string; author_id: string } | null;
  comment?: { content: string; author_id: string } | null;
}

interface RoleEntry {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: { username: string };
}

interface PendingPost {
  id: string;
  title: string;
  content: string;
  image_urls: string[];
  created_at: string;
  author: { username: string };
}

interface PendingComment {
  id: string;
  content: string;
  media_url: string | null;
  created_at: string;
  author: { username: string };
  post: { title: string };
}

const Moderation = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [roles, setRoles] = useState<RoleEntry[]>([]);
  const [pendingPosts, setPendingPosts] = useState<PendingPost[]>([]);
  const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newModUsername, setNewModUsername] = useState('');
  const [addingMod, setAddingMod] = useState(false);

  const checkAccess = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    if (data && data.length > 0) {
      setHasAccess(true);
      setIsAdmin(data.some((r: any) => r.role === 'admin'));
    }
    setLoading(false);
  }, [user]);

  const fetchReports = useCallback(async () => {
    const { data } = await supabase
      .from('reports')
      .select('*, reporter:profiles!reports_reporter_id_fkey(username), post:posts!reports_post_id_fkey(title, content, author_id), comment:comments!reports_comment_id_fkey(content, author_id)')
      .order('created_at', { ascending: false });
    if (data) setReports(data as any);
  }, []);

  const fetchRoles = useCallback(async () => {
    const { data } = await supabase
      .from('user_roles')
      .select('*, profile:profiles!user_roles_user_id_fkey(username)')
      .order('created_at', { ascending: false });
    if (data) setRoles(data as any);
  }, []);

  const fetchPending = useCallback(async () => {
    const { data: posts } = await supabase
      .from('posts')
      .select('id, title, content, image_urls, created_at, author:profiles!posts_author_id_fkey(username)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (posts) setPendingPosts(posts as any);

    const { data: comments } = await supabase
      .from('comments')
      .select('id, content, media_url, created_at, author:profiles!comments_author_id_fkey(username), post:posts!comments_post_id_fkey(title)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (comments) setPendingComments(comments as any);
  }, []);

  useEffect(() => { checkAccess(); }, [checkAccess]);
  useEffect(() => {
    if (hasAccess) { fetchReports(); fetchRoles(); fetchPending(); }
  }, [hasAccess, fetchReports, fetchRoles, fetchPending]);

  const handleUpdateStatus = async (reportId: string, status: string) => {
    const { error } = await supabase.from('reports').update({ status }).eq('id', reportId);
    if (error) { toast.error('Failed to update report'); return; }
    toast.success(`Report marked as ${status}`);
    fetchReports();
  };

  const handleDeleteContent = async (report: Report) => {
    if (!confirm('Are you sure you want to delete this content?')) return;
    try {
      if (report.post_id) await supabase.from('posts').delete().eq('id', report.post_id);
      else if (report.comment_id) await supabase.from('comments').delete().eq('id', report.comment_id);
      await supabase.from('reports').update({ status: 'resolved' }).eq('id', report.id);
      toast.success('Content deleted and report resolved');
      fetchReports();
    } catch { toast.error('Failed to delete content'); }
  };

  const handleApprovePost = async (postId: string) => {
    const { error } = await supabase.from('posts').update({ status: 'approved' } as any).eq('id', postId);
    if (error) { toast.error('Failed to approve'); return; }
    toast.success('Post approved!');
    fetchPending();
  };

  const handleRejectPost = async (postId: string) => {
    if (!confirm('Delete this pending post?')) return;
    await supabase.from('posts').delete().eq('id', postId);
    toast.success('Post rejected and deleted');
    fetchPending();
  };

  const handleApproveComment = async (commentId: string) => {
    const { error } = await supabase.from('comments').update({ status: 'approved' } as any).eq('id', commentId);
    if (error) { toast.error('Failed to approve'); return; }
    toast.success('Comment approved!');
    fetchPending();
  };

  const handleRejectComment = async (commentId: string) => {
    if (!confirm('Delete this pending comment?')) return;
    await supabase.from('comments').delete().eq('id', commentId);
    toast.success('Comment rejected and deleted');
    fetchPending();
  };

  const handleAddModerator = async () => {
    if (!newModUsername.trim()) return;
    setAddingMod(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('id').eq('username', newModUsername.trim()).maybeSingle();
      if (!profile) { toast.error('User not found'); setAddingMod(false); return; }
      const { error } = await supabase.from('user_roles').insert({ user_id: profile.id, role: 'moderator' });
      if (error) {
        if (error.code === '23505') toast.error('User already has this role');
        else throw error;
      } else {
        toast.success(`${newModUsername} added as moderator`);
        setNewModUsername('');
        fetchRoles();
      }
    } catch { toast.error('Failed to add moderator'); }
    setAddingMod(false);
  };

  const handleRemoveRole = async (roleId: string) => {
    if (!confirm('Remove this role?')) return;
    const { error } = await supabase.from('user_roles').delete().eq('id', roleId);
    if (error) { toast.error('Failed to remove role'); return; }
    toast.success('Role removed');
    fetchRoles();
  };

  if (loading) return (
    <div className="min-h-screen bg-background"><Navbar />
      <main className="container mx-auto max-w-4xl px-4 py-6"><p className="text-center text-muted-foreground">Loading...</p></main>
    </div>
  );

  if (!hasAccess) return (
    <div className="min-h-screen bg-background"><Navbar />
      <main className="container mx-auto max-w-4xl px-4 py-6">
        <div className="text-center py-16">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">You don't have permission to access this page.</p>
        </div>
      </main>
    </div>
  );

  const pendingReports = reports.filter(r => r.status === 'pending');
  const resolvedReports = reports.filter(r => r.status !== 'pending');
  const totalPending = pendingPosts.length + pendingComments.length;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-4xl px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Moderation Panel</h1>
          <Badge variant="secondary">{isAdmin ? 'Admin' : 'Moderator'}</Badge>
        </div>

        <Tabs defaultValue="media">
          <TabsList className="mb-4">
            <TabsTrigger value="media">
              Media Review ({totalPending})
            </TabsTrigger>
            <TabsTrigger value="pending">
              Reports ({pendingReports.length})
            </TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
            {isAdmin && <TabsTrigger value="team">Team</TabsTrigger>}
          </TabsList>

          {/* Pending Media Approval */}
          <TabsContent value="media">
            {totalPending === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No content pending approval 🎉</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {pendingPosts.map(p => (
                  <Card key={p.id}>
                    <CardContent className="py-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge>Post</Badge>
                            <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</span>
                          </div>
                          <p className="font-semibold">{p.title}</p>
                          <p className="text-sm text-muted-foreground line-clamp-2">{p.content}</p>
                          <p className="text-xs text-muted-foreground mt-1">By: {p.author?.username}</p>
                          {p.image_urls && p.image_urls.length > 0 && (
                            <div className="flex gap-2 mt-2">
                              {p.image_urls.map((url, i) => (
                                <img key={i} src={url} alt="" className="h-20 w-20 object-cover rounded border" />
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0 ml-3">
                          <Button size="sm" className="gap-1" onClick={() => handleApprovePost(p.id)}>
                            <CheckCircle className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleRejectPost(p.id)}>
                            <Trash2 className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {pendingComments.map(c => (
                  <Card key={c.id}>
                    <CardContent className="py-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary">Comment</Badge>
                            <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                          </div>
                          <p className="text-sm">{c.content}</p>
                          <p className="text-xs text-muted-foreground mt-1">On: "{c.post?.title}" · By: {c.author?.username}</p>
                          {c.media_url && (
                            <img src={c.media_url} alt="" className="h-20 w-20 object-cover rounded border mt-2" />
                          )}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0 ml-3">
                          <Button size="sm" className="gap-1" onClick={() => handleApproveComment(c.id)}>
                            <CheckCircle className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleRejectComment(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pending">
            {pendingReports.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No pending reports 🎉</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {pendingReports.map(report => (
                  <Card key={report.id}>
                    <CardContent className="py-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={report.post_id ? 'default' : 'secondary'}>
                              {report.post_id ? 'Post' : 'Comment'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm font-medium mb-1">Reason: {report.reason}</p>
                          <p className="text-xs text-muted-foreground">Reported by: {report.reporter?.username || 'Unknown'}</p>
                          {report.post && (
                            <div className="mt-2 p-2 bg-muted rounded text-sm">
                              <p className="font-semibold">{report.post.title}</p>
                              <p className="text-muted-foreground line-clamp-2">{report.post.content}</p>
                            </div>
                          )}
                          {report.comment && (
                            <div className="mt-2 p-2 bg-muted rounded text-sm">
                              <p className="text-muted-foreground line-clamp-2">{report.comment.content}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => handleUpdateStatus(report.id, 'dismissed')}>
                            <XCircle className="h-3.5 w-3.5" /> Dismiss
                          </Button>
                          <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleDeleteContent(report)}>
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                          <Button size="sm" className="gap-1" onClick={() => handleUpdateStatus(report.id, 'resolved')}>
                            <CheckCircle className="h-3.5 w-3.5" /> Resolve
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="resolved">
            {resolvedReports.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No resolved reports yet</CardContent></Card>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolvedReports.map(report => (
                    <TableRow key={report.id}>
                      <TableCell><Badge variant="outline">{report.post_id ? 'Post' : 'Comment'}</Badge></TableCell>
                      <TableCell className="max-w-xs truncate">{report.reason}</TableCell>
                      <TableCell><Badge variant={report.status === 'resolved' ? 'default' : 'secondary'}>{report.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {isAdmin && (
            <TabsContent value="team">
              <Card className="mb-4">
                <CardHeader><CardTitle className="text-lg">Add Moderator</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input placeholder="Enter username..." value={newModUsername} onChange={e => setNewModUsername(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddModerator()} />
                    <Button onClick={handleAddModerator} disabled={addingMod || !newModUsername.trim()} className="gap-1 shrink-0">
                      <UserPlus className="h-4 w-4" /> Add
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.profile?.username || 'Unknown'}</TableCell>
                      <TableCell><Badge variant={r.role === 'admin' ? 'default' : 'secondary'}>{r.role}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</TableCell>
                      <TableCell>
                        {r.user_id !== user?.id && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveRole(r.id)}>
                            <UserMinus className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
};

export default Moderation;
