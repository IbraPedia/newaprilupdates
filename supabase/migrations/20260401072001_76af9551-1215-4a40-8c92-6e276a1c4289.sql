
-- Suspensions table for tracking user suspensions
CREATE TABLE public.suspensions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  suspended_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'system'
);

ALTER TABLE public.suspensions ENABLE ROW LEVEL SECURITY;

-- Users can view their own suspensions
CREATE POLICY "Users can view own suspensions"
ON public.suspensions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all suspensions
CREATE POLICY "Admins can view all suspensions"
ON public.suspensions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- System/admins can insert suspensions (via edge function or admin)
CREATE POLICY "Admins can create suspensions"
ON public.suspensions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow anon to check suspensions for content filtering
CREATE POLICY "Anyone can check suspensions"
ON public.suspensions
FOR SELECT
TO anon
USING (true);
