import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { uploadFile, compressImage } from '@/lib/supabaseStorage';
import { containsMiddleFinger, suspendUserForEmoji, checkSuspension } from '@/lib/moderation';
import { useDraft, useLatestDraft } from '@/hooks/useDraft';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Bold, Italic, Heading2, List, ListOrdered, ImagePlus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORIES } from '@/lib/categories';
import { useRef } from 'react';

const MAX_CHARS = 25000;

const CreateThread = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftIdParam = searchParams.get('draft');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<any>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { draft: latestDraft, loading: loadingDraft } = useLatestDraft();
  const { debouncedSave, deleteDraft, saving, lastSaved, currentDraftId } = useDraft(draftIdParam);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, code: false }),
      Image.configure({ HTMLAttributes: { class: 'rounded-lg max-w-full my-2 border' } }),
    ],
    content: '',
    editorProps: {
      attributes: { class: 'prose prose-sm max-w-none min-h-[300px] p-4 focus:outline-none dark:prose-invert' },
    },
    onUpdate: ({ editor }) => {
      debouncedSave({ title, content: editor.getHTML(), category });
    },
  });

  // Show resume dialog if there's a draft and we're not already loading one
  useEffect(() => {
    if (!loadingDraft && latestDraft && !draftIdParam && editor) {
      setPendingDraft(latestDraft);
      setShowResumeDialog(true);
    }
  }, [loadingDraft, latestDraft, draftIdParam, editor]);

  // Load draft from param
  useEffect(() => {
    if (draftIdParam && editor) {
      supabase
        .from('drafts')
        .select('*')
        .eq('id', draftIdParam)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setTitle((data as any).title || '');
            setCategory((data as any).category || '');
            editor.commands.setContent((data as any).content || '');
          }
        });
    }
  }, [draftIdParam, editor]);

  const handleResumeDraft = () => {
    if (pendingDraft && editor) {
      setTitle(pendingDraft.title || '');
      setCategory(pendingDraft.category || '');
      editor.commands.setContent(pendingDraft.content || '');
      // Navigate to include draft param
      navigate(`/create-thread?draft=${pendingDraft.id}`, { replace: true });
    }
    setShowResumeDialog(false);
  };

  const handleDiscardDraft = () => {
    setShowResumeDialog(false);
    setPendingDraft(null);
  };

  // Auto-save on title/category changes
  useEffect(() => {
    if (editor) {
      debouncedSave({ title, content: editor.getHTML(), category });
    }
  }, [title, category]);

  const handleImageInsert = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    try {
      const compressed = await compressImage(file);
      const url = await uploadFile(compressed);
      editor.chain().focus().setImage({ src: url }).run();
    } catch {
      toast.error('Failed to upload image');
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, [editor]);

  const handleSubmit = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!title.trim()) { toast.error('Please add a title'); return; }
    if (!category) { toast.error('Please select a category'); return; }
    if (!editor) return;

    const htmlContent = editor.getHTML();
    const textContent = editor.getText();

    if (textContent.length > MAX_CHARS) {
      toast.error(`Content must be under ${MAX_CHARS.toLocaleString()} characters`);
      return;
    }

    if (containsMiddleFinger(title) || containsMiddleFinger(textContent)) {
      toast.error('Your account has been suspended for 14 days for using a prohibited emoji.');
      try { await suspendUserForEmoji(user.id); } catch {}
      return;
    }

    const { suspended, expiresAt } = await checkSuspension(user.id);
    if (suspended) {
      toast.error(`Your account is suspended until ${new Date(expiresAt!).toLocaleDateString()}.`);
      return;
    }

    setLoading(true);
    try {
      const imgRegex = /src="([^"]+)"/g;
      const imageUrls: string[] = [];
      let match;
      while ((match = imgRegex.exec(htmlContent)) !== null) {
        imageUrls.push(match[1]);
      }

      const hasMedia = imageUrls.length > 0;

      const { error } = await supabase.from('posts').insert({
        title: title.trim(),
        content: htmlContent,
        author_id: user.id,
        image_urls: imageUrls,
        category,
        type: 'thread',
        status: hasMedia ? 'pending' : 'approved',
      } as any);

      if (error) throw error;

      // Delete draft after successful publish
      await deleteDraft();

      if (hasMedia) {
        toast.success('Thread submitted! It will be visible after admin approval.');
      } else {
        toast.success('Thread published!');
      }
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create thread');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    navigate('/auth');
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-2xl px-4 py-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            Create a Thread
          </h1>
          {lastSaved && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Save className="h-3 w-3" />
              {saving ? 'Saving...' : `Saved ${lastSaved.toLocaleTimeString()}`}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <Input placeholder="Thread title" value={title} onChange={e => setTitle(e.target.value)} />

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat.slug} value={cat.slug}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Toolbar */}
          <div className="flex gap-1 flex-wrap border rounded-t-lg p-2 bg-muted/30">
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0"
              onClick={() => editor?.chain().focus().toggleBold().run()}
              data-active={editor?.isActive('bold')}>
              <Bold className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              data-active={editor?.isActive('italic')}>
              <Italic className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0"
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              data-active={editor?.isActive('heading', { level: 2 })}>
              <Heading2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0"
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              data-active={editor?.isActive('bulletList')}>
              <List className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0"
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              data-active={editor?.isActive('orderedList')}>
              <ListOrdered className="h-4 w-4" />
            </Button>
            <div className="border-l mx-1" />
            <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageInsert} className="hidden" />
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs"
              onClick={() => imageInputRef.current?.click()}>
              <ImagePlus className="h-4 w-4" /> Insert Image
            </Button>
          </div>

          {/* Editor */}
          <div className="border border-t-0 rounded-b-lg bg-card min-h-[300px]">
            <EditorContent editor={editor} />
          </div>

          <p className="text-xs text-muted-foreground">
            Write your thread using the formatting tools above. Insert images between paragraphs.
          </p>

          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? 'Publishing...' : 'Publish Thread'}
          </Button>
        </div>
      </main>

      {/* Resume Draft Dialog */}
      <Dialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-heading)' }}>Resume Draft?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You have an unsaved draft: <strong>"{pendingDraft?.title || 'Untitled'}"</strong>.
            Would you like to continue editing it?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleDiscardDraft}>Start Fresh</Button>
            <Button onClick={handleResumeDraft}>Resume Draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CreateThread;
