import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { uploadFile, compressImage } from '@/lib/supabaseStorage';
import { containsMiddleFinger, suspendUserForEmoji, checkSuspension } from '@/lib/moderation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORIES } from '@/lib/categories';

interface Props {
  onPostCreated: () => void;
  defaultCategory?: string;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
}

const MAX_CHARS = 500;
const MAX_IMAGES = 4;

const CreatePostDialog = ({ onPostCreated, defaultCategory, externalOpen, onExternalOpenChange }: Props) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState(defaultCategory || '');
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isControlled = externalOpen !== undefined;
  const isOpen = isControlled ? externalOpen : open;
  const setIsOpen = isControlled ? (v: boolean) => onExternalOpenChange?.(v) : setOpen;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_IMAGES - images.length;
    if (files.length > remaining) toast.error(`You can only add ${remaining} more photo(s)`);
    const selected = files.slice(0, remaining);
    const newPreviews = selected.map((f) => URL.createObjectURL(f));
    setImages((prev) => [...prev, ...selected]);
    setPreviews((prev) => [...prev, ...newPreviews]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!postTitle.trim()) { toast.error('Please add a title'); return; }
    if (!content.trim()) { toast.error('Please write something'); return; }
    if (!category) { toast.error('Please select a category'); return; }
    if (content.length > MAX_CHARS) { toast.error(`Post must be under ${MAX_CHARS} characters`); return; }

    if (containsMiddleFinger(content)) {
      toast.error('Your account has been suspended for 14 days for using a prohibited emoji.');
      try { await suspendUserForEmoji(user!.id); } catch {}
      return;
    }

    const { suspended, expiresAt } = await checkSuspension(user!.id);
    if (suspended) {
      toast.error(`Your account is suspended until ${new Date(expiresAt!).toLocaleDateString()}.`);
      return;
    }

    setLoading(true);
    try {
      const mediaUrls: string[] = [];
      for (const img of images) {
        const compressed = await compressImage(img);
        const url = await uploadFile(compressed);
        mediaUrls.push(url);
      }

      const hasMedia = mediaUrls.length > 0;
      const { error } = await supabase.from('posts').insert({
        title: postTitle.trim(),
        content: content.trim(),
        author_id: user!.id,
        image_urls: mediaUrls,
        category,
        type: 'post',
        status: hasMedia ? 'pending' : 'approved',
      } as any);
      if (error) throw error;

      if (hasMedia) {
        toast.success('Post submitted! Visible after admin approval.');
      } else {
        toast.success('Post published!');
      }
      setPostTitle(''); setContent(''); setCategory(defaultCategory || '');
      setImages([]); previews.forEach(p => URL.revokeObjectURL(p)); setPreviews([]);
      setIsOpen(false);
      onPostCreated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'var(--font-heading)' }}>Create a Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Input
            placeholder="Post title"
            value={postTitle}
            onChange={(e) => setPostTitle(e.target.value)}
            maxLength={100}
          />

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat.slug} value={cat.slug}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="space-y-1">
            <Textarea
              placeholder="What's on your mind?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              maxLength={MAX_CHARS}
            />
            <p className="text-xs text-muted-foreground text-right">
              {content.length} / {MAX_CHARS}
            </p>
          </div>

          {previews.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {previews.map((src, i) => (
                <div key={i} className="relative group rounded-lg overflow-hidden border">
                  <img src={src} alt="" className="w-full h-32 object-cover" />
                  <button type="button" onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 bg-background/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= MAX_IMAGES} className="gap-1.5">
              <ImagePlus className="h-4 w-4" /> Photos ({images.length}/{MAX_IMAGES})
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Up to {MAX_IMAGES} photos.
          </p>

          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? 'Publishing...' : 'Publish Post'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePostDialog;
