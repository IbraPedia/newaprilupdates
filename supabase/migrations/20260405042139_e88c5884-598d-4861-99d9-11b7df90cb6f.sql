
-- Add impressions column to posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS impressions integer NOT NULL DEFAULT 0;

-- Create post_impressions tracking table for rate limiting
CREATE TABLE public.post_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  viewer_id uuid,
  session_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.post_impressions ENABLE ROW LEVEL SECURITY;

-- Anyone can insert impressions (including guests)
CREATE POLICY "Anyone can record impressions" ON public.post_impressions
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read raw impression data
CREATE POLICY "Admins can view impressions" ON public.post_impressions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for efficient lookups
CREATE INDEX idx_post_impressions_post_id ON public.post_impressions(post_id);
CREATE INDEX idx_post_impressions_dedup ON public.post_impressions(post_id, viewer_id, session_id);

-- Function to record impression with rate limiting (1 per post per viewer/session per hour)
CREATE OR REPLACE FUNCTION public.record_impression(p_post_id uuid, p_viewer_id uuid DEFAULT NULL, p_session_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if already recorded in last hour
  IF EXISTS (
    SELECT 1 FROM post_impressions
    WHERE post_id = p_post_id
      AND (
        (p_viewer_id IS NOT NULL AND viewer_id = p_viewer_id)
        OR (p_session_id IS NOT NULL AND session_id = p_session_id)
      )
      AND created_at > now() - interval '1 hour'
  ) THEN
    RETURN;
  END IF;

  -- Insert impression record
  INSERT INTO post_impressions (post_id, viewer_id, session_id)
  VALUES (p_post_id, p_viewer_id, p_session_id);

  -- Increment counter
  UPDATE posts SET impressions = impressions + 1 WHERE id = p_post_id;
END;
$$;
