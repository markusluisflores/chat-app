-- IF NOT EXISTS: staging had this column applied via direct SQL before the migration was tracked
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
