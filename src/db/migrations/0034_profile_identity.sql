-- Profiles without sign-in (see src/lib/identity.ts). Accounts still live in auth.users,
-- so every existing foreign key, cascade and RLS policy keeps working; the app now
-- creates those rows itself instead of Supabase Auth.
--
-- First, prove this database lets the app's connection add and remove an account row.
-- If it doesn't, the migration stops here, before anything is changed.
DO $$
DECLARE probe uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id) VALUES (probe);
  DELETE FROM auth.users WHERE id = probe;
END $$;--> statement-breakpoint
CREATE TABLE "identity_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "identity_tokens_kind" CHECK ("identity_tokens"."kind" in ('device', 'recovery'))
);
--> statement-breakpoint
ALTER TABLE "identity_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "avatar_path" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "identity_tokens" ADD CONSTRAINT "identity_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "identity_tokens_user_idx" ON "identity_tokens" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_username_key" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_username_format" CHECK ("profiles"."username" is null or "profiles"."username" ~ '^[a-z0-9_]{3,20}$');--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_bio_length" CHECK ("profiles"."bio" is null or char_length("profiles"."bio") <= 160);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_avatar_path" CHECK ("profiles"."avatar_path" is null or "profiles"."avatar_path" like "profiles"."user_id"::text || '/%');--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_contact_email" CHECK ("profiles"."contact_email" is null or (char_length("profiles"."contact_email") <= 254 and "profiles"."contact_email" ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'));--> statement-breakpoint
REVOKE ALL ON public.identity_tokens FROM anon, authenticated;--> statement-breakpoint
-- Everyone who already has a social profile keeps their handle as their username.
UPDATE public.profiles p
SET username = s.handle, bio = s.bio, avatar_path = s.avatar_path
FROM public.social_profiles s
WHERE s.user_id = p.user_id;--> statement-breakpoint
-- The profile is the one place a username, bio and picture are kept. The social profile
-- (opt-in, read by other people through profile_cards) always copies them.
CREATE OR REPLACE FUNCTION public.social_profile_from_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE p record;
BEGIN
  SELECT username, bio, avatar_path INTO p FROM public.profiles WHERE user_id = NEW.user_id;
  IF p.username IS NOT NULL THEN
    NEW.handle := p.username;
    NEW.bio := p.bio;
    NEW.avatar_path := p.avatar_path;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER social_profile_from_identity
  BEFORE INSERT OR UPDATE ON public.social_profiles
  FOR EACH ROW EXECUTE FUNCTION public.social_profile_from_identity();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.identity_to_social_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.social_profiles SET updated_at = now() WHERE user_id = NEW.user_id;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER identity_to_social_profile
  AFTER UPDATE OF username, bio, avatar_path ON public.profiles
  FOR EACH ROW
  WHEN (NEW.username IS NOT NULL AND (OLD.username, OLD.bio, OLD.avatar_path) IS DISTINCT FROM (NEW.username, NEW.bio, NEW.avatar_path))
  EXECUTE FUNCTION public.identity_to_social_profile();--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.social_profile_from_identity() FROM public, anon, authenticated;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.identity_to_social_profile() FROM public, anon, authenticated;
