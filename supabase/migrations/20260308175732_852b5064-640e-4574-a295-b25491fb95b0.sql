-- Revert: Allow guests to READ approved posts and comments (no engagement)
-- Drop authenticated-only policies
DROP POLICY IF EXISTS "Authenticated can view approved posts" ON public.posts;
DROP POLICY IF EXISTS "Authenticated can view approved comments" ON public.comments;

-- Posts: anyone (anon + authenticated) can read approved posts; authors/mods see own/all
CREATE POLICY "Anyone can view approved posts"
ON public.posts
FOR SELECT
TO anon, authenticated
USING (
  status = 'approved'
  OR author_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'moderator')
);

-- Comments: anyone can read approved comments; authors/mods see own/all
CREATE POLICY "Anyone can view approved comments"
ON public.comments
FOR SELECT
TO anon, authenticated
USING (
  status = 'approved'
  OR author_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'moderator')
);

-- Likes: allow anon to read likes (for displaying counts to guests)
DROP POLICY IF EXISTS "Authenticated users can view likes" ON public.likes;
CREATE POLICY "Anyone can view likes"
ON public.likes
FOR SELECT
TO anon, authenticated
USING (true);