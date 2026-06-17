-- Add username column to profiles
ALTER TABLE public.profiles
  ADD COLUMN username text unique;

-- Format constraint: 3-30 chars, lowercase alphanumeric + hyphens + underscores
ALTER TABLE public.profiles
  ADD CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_-]{3,30}$');

-- Backfill existing users from their email local part
DO $$
DECLARE
  rec RECORD;
  base_name text;
  candidate text;
  suffix int;
BEGIN
  FOR rec IN
    SELECT p.id, u.email
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.username IS NULL
    ORDER BY p.id
  LOOP
    base_name := left(
      regexp_replace(lower(split_part(rec.email, '@', 1)), '[^a-z0-9_-]', '-', 'g'),
      30
    );
    candidate := base_name;
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
      candidate := left(base_name, 27) || '-' || suffix::text;
      suffix := suffix + 1;
    END LOOP;
    UPDATE public.profiles SET username = candidate WHERE id = rec.id;
  END LOOP;
END $$;

-- Now enforce not-null (all rows are filled above)
ALTER TABLE public.profiles ALTER COLUMN username SET NOT NULL;

-- Update the profile-creation trigger to include username
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, username)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'username'
  );
  RETURN new;
END;
$$;
