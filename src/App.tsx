import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { lazy, Suspense } from "react";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const PostDetail = lazy(() => import("./pages/PostDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const Bookmarks = lazy(() => import("./pages/Bookmarks"));
const CategoryFeed = lazy(() => import("./pages/CategoryFeed"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Moderation = lazy(() => import("./pages/Moderation"));
const Privacy = lazy(() => import("./pages/Privacy"));
const CreateThread = lazy(() => import("./pages/CreateThread"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Analytics />
        <SpeedInsights />
        <BrowserRouter>
          <SidebarProvider>
            <div className="min-h-screen flex w-full">
              <AppSidebar />
              <div className="flex-1 flex flex-col min-w-0">
                <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/post/:id" element={<PostDetail />} />
                  <Route path="/profile/:id" element={<Profile />} />
                  <Route path="/bookmarks" element={<Bookmarks />} />
                  <Route path="/category/:slug" element={<CategoryFeed />} />
                  <Route path="/moderation" element={<Moderation />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/create-thread" element={<CreateThread />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
              </div>
            </div>
          </SidebarProvider>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
