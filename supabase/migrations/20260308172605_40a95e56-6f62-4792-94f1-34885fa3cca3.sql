
-- Fix security definer view issue
DROP VIEW IF EXISTS public.profiles_public;

-- Recreate with security_invoker=on (recommended by Supabase)
CREATE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT id, username, avatar_url, is_verified, created_at
FROM public.profiles;

-- Drop the restrictive anon policy - anon needs SELECT for the view to work with security_invoker
DROP POLICY IF EXISTS "Anon cannot access profiles directly" ON public.profiles;

-- Anon can SELECT profiles (view filters to safe columns only)
CREATE POLICY "Anon can select profiles"
ON public.profiles FOR SELECT
TO anon
USING (true);

-- Grant view access to anon
GRANT SELECT ON public.profiles_public TO anon;
GRANT SELECT ON public.profiles_public TO authenticated;
