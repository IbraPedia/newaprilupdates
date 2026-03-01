import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  onPostCreated: () => void;
}

const CreatePostDialog = ({ onPostCreated }: Props) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Please fill in both title and content');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from('posts').insert({
        title: title.trim(),
        content: content.trim(),
        author_id: user!.id,
      });
      if (error) throw error;
      toast.success('Post published!');
      setTitle('');
      setContent('');
      setOpen(false);
      onPostCreated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Create Post
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'var(--font-heading)' }}>Create a New Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Input
            placeholder="Post title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="What's on your mind?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
          />
          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? 'Publishing...' : 'Publish Post'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePostDialog;
