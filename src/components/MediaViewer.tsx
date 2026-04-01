import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';

interface MediaViewerProps {
  open: boolean;
  onClose: () => void;
  url: string;
  isVideo: boolean;
}

const MediaViewer = ({ open, onClose, url, isVideo }: MediaViewerProps) => {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-none bg-black/90 flex items-center justify-center">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-50 bg-background/80 rounded-full p-1.5 hover:bg-background transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        {isVideo ? (
          <video src={url} controls autoPlay playsInline preload="auto" className="max-w-full max-h-[90vh] rounded bg-black" />
        ) : (
          <img src={url} alt="" className="max-w-full max-h-[90vh] object-contain rounded" />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MediaViewer;
