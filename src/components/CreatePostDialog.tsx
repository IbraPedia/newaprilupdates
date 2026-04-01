import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { uploadFile, compressImage } from '@/lib/supabaseStorage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, ImagePlus, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORIES } from '@/lib/categories';

interface Props {
  onPostCreated: () => void;
  defaultCategory?: string;
}

const MAX_CHARS = 25000;
const MAX_IMAGES = 10;
const MAX_VIDEO_MB = 50;

const CreatePostDialog = ({ onPostCreated, defaultCategory }: Props) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState(defaultCategory || '');
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const hasVideo = !!videoFile;
  const hasImages = images.length > 0;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (hasVideo) { toast.error('Remove video first to add photos'); return; }
    const files = Array.from(e.target.files || []);
    const remaining = MAX_IMAGES - images.length;
    if (files.length > remaining) toast.error(`You can only add ${remaining} more photo(s)`);
    const selected = files.slice(0, remaining);
    const newPreviews = selected.map((f) => URL.createObjectURL(f));
    setImages((prev) => [...prev, ...selected]);
    setPreviews((prev) => [...prev, ...newPreviews]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (hasImages) { toast.error('Remove photos first to add a video'); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) { toast.error(`Video must be under ${MAX_VIDEO_MB}MB`); return; }
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const removeVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(null);
    setVideoPreview(null);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) { toast.error('Please fill in both title and content'); return; }
    if (!category) { toast.error('Please select a category'); return; }
    if (content.length > MAX_CHARS) { toast.error(`Content must be under ${MAX_CHARS.toLocaleString()} characters`); return; }

    setLoading(true);
    try {
      const mediaUrls: string[] = [];

      for (const img of images) {
        const compressed = await compressImage(img);
        const url = await uploadFile(compressed);
        mediaUrls.push(url);
      }

      if (videoFile) {
        const url = await uploadFile(videoFile);
        mediaUrls.push(url);
      }

      const hasMedia = mediaUrls.length > 0;

      const { error } = await supabase.from('posts').insert({
        title: title.trim(),
        content: content.trim(),
        author_id: user!.id,
        image_urls: mediaUrls,
        category,
        status: hasMedia ? 'pending' : 'approved',
      } as any);
      if (error) throw error;

      if (hasMedia) {
        toast.success('Post submitted! It will be visible after admin approval.');
      } else {
        toast.success('Post published!');
      }
      setTitle(''); setContent(''); setCategory(defaultCategory || '');
      setImages([]); previews.forEach(p => URL.revokeObjectURL(p)); setPreviews([]);
      removeVideo();
      setOpen(false);
      onPostCreated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  const insertFormatting = (wrapper: string) => {
    const textarea = document.querySelector<HTMLTextAreaElement>('#post-content-area');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);
    const newContent = content.substring(0, start) + wrapper + selected + wrapper + content.substring(end);
    setContent(newContent);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Create Post</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'var(--font-heading)' }}>Create a New Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Input placeholder="Post title" value={title} onChange={(e) => setTitle(e.target.value)} />

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat.slug} value={cat.slug}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="space-y-1">
            <div className="flex gap-1 mb-1">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs font-bold" onClick={() => insertFormatting('**')}>B</Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs italic" onClick={() => insertFormatting('*')}>I</Button>
            </div>
            <Textarea
              id="post-content-area"
              placeholder="What's on your mind? Use **bold** or *italic*"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              maxLength={MAX_CHARS}
            />
            <p className="text-xs text-muted-foreground text-right">
              {content.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
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

          {videoPreview && (
            <div className="relative group rounded-lg overflow-hidden border">
              <video src={videoPreview} controls className="w-full max-h-48" />
              <button type="button" onClick={removeVideo}
                className="absolute top-1 right-1 bg-background/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= MAX_IMAGES || hasVideo} className="gap-1.5">
              <ImagePlus className="h-4 w-4" /> Photos ({images.length}/{MAX_IMAGES})
            </Button>

            <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideoSelect} className="hidden" />
            <Button type="button" variant="outline" size="sm" onClick={() => videoInputRef.current?.click()}
              disabled={!!videoFile || hasImages} className="gap-1.5">
              <Video className="h-4 w-4" /> {videoFile ? 'Video added' : 'Add Video'}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            You can attach up to {MAX_IMAGES} photos or 1 video (max {MAX_VIDEO_MB}MB), not both. Photos are auto-compressed to WebP.
            {(images.length > 0 || videoFile) && ' Posts with media require admin approval.'}
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
