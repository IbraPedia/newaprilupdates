import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useModRole } from '@/hooks/useModRole';
import { NavLink } from '@/components/NavLink';
import { ContactDialog } from '@/components/ContactDialog';
import { CATEGORIES } from '@/lib/categories';
import { Home, Bookmark, LogOut, LogIn, Mail, Shield, FileText } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel,
  SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';

export function AppSidebar() {
  const { user, signOut } = useAuth();
  const { hasRole } = useModRole();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/" end className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                    <Home className="mr-2 h-4 w-4" />
                    {!collapsed && <span>Home</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Categories</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {CATEGORIES.map(cat => (
                <SidebarMenuItem key={cat.slug}>
                  <SidebarMenuButton asChild>
                    <NavLink to={`/category/${cat.slug}`} className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                      <cat.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{cat.label}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {user ? (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/bookmarks" className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                        <Bookmark className="mr-2 h-4 w-4" />
                        {!collapsed && <span>Bookmarks</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {hasRole && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/moderation" className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                          <Shield className="mr-2 h-4 w-4" />
                          {!collapsed && <span>Moderation</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </>
              ) : (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/auth" className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                      <LogIn className="mr-2 h-4 w-4" />
                      {!collapsed && <span>Sign In / Register</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <ContactDialog
                  trigger={
                    <SidebarMenuButton className="cursor-pointer">
                      <Mail className="mr-2 h-4 w-4" />
                      {!collapsed && <span>Contact Us</span>}
                    </SidebarMenuButton>
                  }
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/privacy" className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                    <FileText className="mr-2 h-4 w-4" />
                    {!collapsed && <span>Privacy Policy</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <ThemeToggle collapsed={collapsed} />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {user && (
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <button onClick={signOut} className="flex w-full items-center hover:bg-destructive/10 px-2 py-1.5 rounded-md text-sm text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      {!collapsed && <span>Logout</span>}
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
