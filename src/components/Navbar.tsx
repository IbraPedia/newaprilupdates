import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Bell, LogOut } from 'lucide-react';
import NotificationDropdown from './NotificationDropdown';
import logo from '@/assets/logo.png';

const Navbar = () => {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo} alt="Kanisa Kiganjani" className="h-10 w-10 rounded-xl" />
          <span className="text-xl font-bold text-primary" style={{ fontFamily: 'var(--font-heading)' }}>
            Kanisa Kiganjani
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <NotificationDropdown />
              <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
                <LogOut className="h-5 w-5" />
              </Button>
            </>
          ) : (
            <Link to="/auth">
              <Button>Sign In</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
