import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { X, LogIn } from 'lucide-react';

const GuestLoginPrompt = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (user) return; // Don't show for logged-in users

    // Show after 5 seconds initially, then every 15 seconds
    const initial = setTimeout(() => {
      setVisible(true);
    }, 5000);

    const interval = setInterval(() => {
      if (!dismissed) setVisible(true);
    }, 15000);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [user, dismissed]);

  if (user || !visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border border-border rounded-xl shadow-lg p-4 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Join Kanisa Kiganjani</p>
          <p className="text-xs text-muted-foreground mt-0.5">Sign in to like, comment, and share posts</p>
        </div>
        <Button
          size="sm"
          onClick={() => navigate('/auth')}
          className="gap-1.5 shrink-0"
        >
          <LogIn className="h-3.5 w-3.5" /> Sign In
        </Button>
        <button
          onClick={() => { setVisible(false); setDismissed(true); setTimeout(() => setDismissed(false), 15000); }}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default GuestLoginPrompt;
