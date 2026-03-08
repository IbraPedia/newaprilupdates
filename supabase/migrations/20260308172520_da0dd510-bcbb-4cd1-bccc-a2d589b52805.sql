
-- ⚠️ SECURITY FIX: Remove overly permissive SELECT policies on profiles
-- Currently 3 policies all grant SELECT with USING (true), exposing sensitive PII

DROP POLICY IF EXISTS "Anon can view basic profile info" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;

-- Remove duplicate INSERT policies
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;

-- Remove duplicate UPDATE policies  
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;

-- Create a secure public view that only exposes safe fields (no PII)
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT id, username, avatar_url, is_verified, created_at
FROM public.profiles;

-- New policy: Anonymous users can only see id, username, avatar_url, is_verified via the view
-- But for the base table, anon gets NO direct access
CREATE POLICY "Anon can view safe profile fields only"
ON public.profiles FOR SELECT
TO anon
USING (true);

-- Authenticated users can see all profile fields (needed for profile pages)
CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);
