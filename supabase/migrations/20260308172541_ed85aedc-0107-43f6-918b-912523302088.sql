
-- Fix: Anon should NOT have direct access to the base profiles table
-- They should only access the profiles_public view
DROP POLICY IF EXISTS "Anon can view safe profile fields only" ON public.profiles;

-- Recreate view WITHOUT security_invoker so it runs as definer (can access base table)
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public AS
SELECT id, username, avatar_url, is_verified, created_at
FROM public.profiles;

-- Grant anon SELECT only on the VIEW, not the base table
GRANT SELECT ON public.profiles_public TO anon;

-- Anon policy on base table: deny direct access (use false)
CREATE POLICY "Anon cannot access profiles directly"
ON public.profiles FOR SELECT
TO anon
USING (false);
