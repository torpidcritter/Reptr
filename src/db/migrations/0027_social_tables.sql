CREATE TYPE "public"."account_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."post_kind" AS ENUM('workout');--> statement-breakpoint
CREATE TYPE "public"."post_visibility" AS ENUM('public', 'followers', 'only_me');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'harassment', 'hate', 'sexual_content', 'self_harm', 'impersonation', 'cheating', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "blocks_not_self" CHECK ("blocks"."blocker_id" <> "blocks"."blocked_id")
);
--> statement-breakpoint
ALTER TABLE "blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"parent_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	CONSTRAINT "comments_body_length" CHECK (char_length("comments"."body") between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "follow_requests" (
	"requester_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_requests_requester_id_target_id_pk" PRIMARY KEY("requester_id","target_id"),
	CONSTRAINT "follow_requests_not_self" CHECK ("follow_requests"."requester_id" <> "follow_requests"."target_id")
);
--> statement-breakpoint
ALTER TABLE "follow_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" uuid NOT NULL,
	"followee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id"),
	CONSTRAINT "follows_not_self" CHECK ("follows"."follower_id" <> "follows"."followee_id")
);
--> statement-breakpoint
ALTER TABLE "follows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "post_likes" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "post_likes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"kind" "post_kind" DEFAULT 'workout' NOT NULL,
	"workout_id" uuid NOT NULL,
	"caption" text,
	"visibility" "post_visibility" DEFAULT 'followers' NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_workout_key" UNIQUE("workout_id"),
	CONSTRAINT "posts_caption_length" CHECK ("posts"."caption" is null or char_length("posts"."caption") <= 500)
);
--> statement-breakpoint
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"post_id" uuid,
	"comment_id" uuid,
	"reason" "report_reason" NOT NULL,
	"details" text,
	"snapshot" jsonb,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_details_length" CHECK ("reports"."details" is null or char_length("reports"."details") <= 1000),
	CONSTRAINT "reports_not_self" CHECK ("reports"."reporter_id" <> "reports"."target_user_id")
);
--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "social_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"bio" text,
	"avatar_path" text,
	"visibility" "account_visibility" DEFAULT 'private' NOT NULL,
	"discoverable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_profiles_handle_key" UNIQUE("handle"),
	CONSTRAINT "social_profiles_handle_format" CHECK ("social_profiles"."handle" ~ '^[a-z0-9_]{3,20}$'),
	CONSTRAINT "social_profiles_bio_length" CHECK ("social_profiles"."bio" is null or char_length("social_profiles"."bio") <= 160),
	CONSTRAINT "social_profiles_avatar_path" CHECK ("social_profiles"."avatar_path" is null or "social_profiles"."avatar_path" like "social_profiles"."user_id"::text || '/%')
);
--> statement-breakpoint
ALTER TABLE "social_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_social_profiles_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."social_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_requests" ADD CONSTRAINT "follow_requests_requester_id_social_profiles_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."social_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_requests" ADD CONSTRAINT "follow_requests_target_id_social_profiles_user_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."social_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_social_profiles_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."social_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_social_profiles_user_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."social_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_social_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."social_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_social_profiles_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."social_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_workout_fk" FOREIGN KEY ("workout_id","author_id") REFERENCES "public"."workouts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "comments_post_idx" ON "comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_author_idx" ON "comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "follow_requests_target_idx" ON "follow_requests" USING btree ("target_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "follows_followee_idx" ON "follows" USING btree ("followee_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "post_likes_user_idx" ON "post_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "posts_author_idx" ON "posts" USING btree ("author_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_created_idx" ON "posts" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "reports_post_idx" ON "reports" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "reports_comment_idx" ON "reports" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "social_profiles_handle_prefix_idx" ON "social_profiles" USING btree ("handle" text_pattern_ops);--> statement-breakpoint
CREATE POLICY "blocks_owner" ON "blocks" AS PERMISSIVE FOR ALL TO "authenticated" USING ("blocks"."blocker_id" = (select auth.uid())) WITH CHECK ("blocks"."blocker_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "comments_read" ON "comments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.posts p where p.id = "comments"."post_id") and ("comments"."author_id" = (select auth.uid()) or not public.social_blocked((select auth.uid()), "comments"."author_id")));--> statement-breakpoint
CREATE POLICY "comments_insert" ON "comments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("comments"."author_id" = (select auth.uid()) and exists (select 1 from public.posts p where p.id = "comments"."post_id")
        and not exists (select 1 from public.posts p
                        where p.id = "comments"."post_id" and public.social_blocked((select auth.uid()), p.author_id)));--> statement-breakpoint
CREATE POLICY "comments_update" ON "comments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("comments"."author_id" = (select auth.uid())) WITH CHECK ("comments"."author_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "comments_delete" ON "comments" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("comments"."author_id" = (select auth.uid())
        or exists (select 1 from public.posts p where p.id = "comments"."post_id" and p.author_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "follow_requests_read" ON "follow_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("follow_requests"."requester_id" = (select auth.uid()) or "follow_requests"."target_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "follow_requests_insert" ON "follow_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("follow_requests"."requester_id" = (select auth.uid()) and not public.social_blocked((select auth.uid()), "follow_requests"."target_id")
        and not public.social_follows("follow_requests"."requester_id", "follow_requests"."target_id")
        and exists (select 1 from public.social_profiles sp
                    where sp.user_id = "follow_requests"."target_id" and sp.visibility = 'private'));--> statement-breakpoint
CREATE POLICY "follow_requests_delete" ON "follow_requests" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("follow_requests"."requester_id" = (select auth.uid()) or "follow_requests"."target_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "follows_read" ON "follows" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("follows"."follower_id" = (select auth.uid()) or "follows"."followee_id" = (select auth.uid())
        or (public.social_can_see((select auth.uid()), "follows"."followee_id") and not public.social_blocked((select auth.uid()), "follows"."follower_id")));--> statement-breakpoint
CREATE POLICY "follows_insert" ON "follows" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((
          "follows"."follower_id" = (select auth.uid()) and not public.social_blocked((select auth.uid()), "follows"."followee_id")
          and exists (select 1 from public.social_profiles sp
                      where sp.user_id = "follows"."followee_id" and sp.visibility = 'public')
        ) or (
          "follows"."followee_id" = (select auth.uid()) and not public.social_blocked((select auth.uid()), "follows"."follower_id")
          and exists (select 1 from public.follow_requests r
                      where r.requester_id = "follows"."follower_id" and r.target_id = "follows"."followee_id")
        ));--> statement-breakpoint
CREATE POLICY "follows_delete" ON "follows" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("follows"."follower_id" = (select auth.uid()) or "follows"."followee_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "post_likes_read" ON "post_likes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.posts p where p.id = "post_likes"."post_id") and ("post_likes"."user_id" = (select auth.uid()) or not public.social_blocked((select auth.uid()), "post_likes"."user_id")));--> statement-breakpoint
CREATE POLICY "post_likes_insert" ON "post_likes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("post_likes"."user_id" = (select auth.uid()) and exists (select 1 from public.posts p where p.id = "post_likes"."post_id"));--> statement-breakpoint
CREATE POLICY "post_likes_delete" ON "post_likes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("post_likes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "posts_read" ON "posts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.social_can_see_post((select auth.uid()), "posts"."author_id", "posts"."visibility"::text));--> statement-breakpoint
CREATE POLICY "posts_owner_write" ON "posts" AS PERMISSIVE FOR ALL TO "authenticated" USING ("posts"."author_id" = (select auth.uid())) WITH CHECK ("posts"."author_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "reports_insert" ON "reports" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("reports"."reporter_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "reports_read_own" ON "reports" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("reports"."reporter_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "social_profiles_read" ON "social_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("social_profiles"."user_id" = (select auth.uid()) or not public.social_blocked((select auth.uid()), "social_profiles"."user_id"));--> statement-breakpoint
CREATE POLICY "social_profiles_owner_write" ON "social_profiles" AS PERMISSIVE FOR ALL TO "authenticated" USING ("social_profiles"."user_id" = (select auth.uid())) WITH CHECK ("social_profiles"."user_id" = (select auth.uid()));