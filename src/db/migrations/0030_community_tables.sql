CREATE TYPE "public"."challenge_metric" AS ENUM('workouts', 'volume', 'sets', 'minutes');--> statement-breakpoint
CREATE TYPE "public"."challenge_visibility" AS ENUM('only_me', 'followers', 'group', 'public');--> statement-breakpoint
CREATE TYPE "public"."group_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."group_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."moderation_action" AS ENUM('dismiss', 'remove_post', 'remove_comment', 'suspend', 'unsuspend', 'exclude_leaderboards', 'include_leaderboards');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('follow', 'follow_request', 'follow_accepted', 'like', 'comment', 'reply', 'challenge_completed', 'badge', 'level_up', 'group_joined');--> statement-breakpoint
CREATE TABLE "challenge_members" (
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "challenge_members_challenge_id_user_id_pk" PRIMARY KEY("challenge_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "challenge_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid,
	"group_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"metric" "challenge_metric" NOT NULL,
	"target" numeric(12, 1),
	"visibility" "challenge_visibility" NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"season_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenges_season_key" UNIQUE("season_key"),
	CONSTRAINT "challenges_title_length" CHECK (char_length("challenges"."title") between 3 and 60),
	CONSTRAINT "challenges_description_length" CHECK ("challenges"."description" is null or char_length("challenges"."description") <= 280),
	CONSTRAINT "challenges_dates" CHECK ("challenges"."ends_on" >= "challenges"."starts_on" and "challenges"."ends_on" - "challenges"."starts_on" <= 92),
	CONSTRAINT "challenges_target" CHECK ("challenges"."target" is null or "challenges"."target" > 0),
	CONSTRAINT "challenges_group" CHECK (("challenges"."visibility" = 'group') = ("challenges"."group_id" is not null)),
	CONSTRAINT "challenges_owner" CHECK ("challenges"."creator_id" is not null or ("challenges"."season_key" is not null and "challenges"."visibility" = 'public'))
);
--> statement-breakpoint
ALTER TABLE "challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "group_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "group_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"visibility" "group_visibility" DEFAULT 'private' NOT NULL,
	"invite_code" text DEFAULT substr(md5(gen_random_uuid()::text), 1, 12) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_invite_code_key" UNIQUE("invite_code"),
	CONSTRAINT "groups_name_length" CHECK (char_length("groups"."name") between 3 and 40),
	CONSTRAINT "groups_description_length" CHECK ("groups"."description" is null or char_length("groups"."description") <= 280)
);
--> statement-breakpoint
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "moderation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moderator_id" uuid NOT NULL,
	"action" "moderation_action" NOT NULL,
	"report_id" uuid,
	"target_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderation_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"muted" "notification_kind"[] DEFAULT '{}' NOT NULL,
	"push" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"actor_id" uuid,
	"kind" "notification_kind" NOT NULL,
	"post_id" uuid,
	"comment_id" uuid,
	"challenge_id" uuid,
	"group_id" uuid,
	"data" jsonb,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE("endpoint"),
	CONSTRAINT "push_subscriptions_https" CHECK ("push_subscriptions"."endpoint" like 'https://%')
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "social_sanctions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"suspended_at" timestamp with time zone,
	"excluded_from_boards_at" timestamp with time zone,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_sanctions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" uuid NOT NULL,
	"badge" text NOT NULL,
	"earned_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_badge_pk" PRIMARY KEY("user_id","badge")
);
--> statement-breakpoint
ALTER TABLE "user_badges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_levels" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_levels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "leaderboards" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "challenge_members" ADD CONSTRAINT "challenge_members_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_members" ADD CONSTRAINT "challenge_members_user_id_social_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."social_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_creator_id_social_profiles_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."social_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_social_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."social_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_social_profiles_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."social_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_log" ADD CONSTRAINT "moderation_log_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_social_profiles_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."social_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_sanctions" ADD CONSTRAINT "social_sanctions_user_id_social_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."social_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_levels" ADD CONSTRAINT "user_levels_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_members_user_idx" ON "challenge_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "challenges_creator_idx" ON "challenges" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "challenges_group_idx" ON "challenges" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "challenges_open_idx" ON "challenges" USING btree ("visibility","ends_on");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "groups_owner_idx" ON "groups" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "moderation_log_report_idx" ON "moderation_log" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "moderation_log_target_idx" ON "moderation_log" USING btree ("target_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_key" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_actor_idx" ON "notifications" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "notifications_post_idx" ON "notifications" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "notifications_comment_idx" ON "notifications" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "notifications_challenge_idx" ON "notifications" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "notifications_group_idx" ON "notifications" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "challenge_members_read" ON "challenge_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.challenge_can_see("challenge_members"."challenge_id", (select auth.uid()))
        and not public.social_blocked((select auth.uid()), "challenge_members"."user_id"));--> statement-breakpoint
CREATE POLICY "challenge_members_join" ON "challenge_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("challenge_members"."user_id" = (select auth.uid()) and "challenge_members"."completed_at" is null
        and public.challenge_can_join("challenge_members"."challenge_id", (select auth.uid())));--> statement-breakpoint
CREATE POLICY "challenge_members_leave" ON "challenge_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("challenge_members"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "challenges_read" ON "challenges" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("challenges"."creator_id" = (select auth.uid()) or public.challenge_can_see("challenges"."id", (select auth.uid())));--> statement-breakpoint
CREATE POLICY "challenges_insert" ON "challenges" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("challenges"."creator_id" = (select auth.uid()) and "challenges"."season_key" is null
        and ("challenges"."group_id" is null or public.group_member("challenges"."group_id", (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "challenges_creator_delete" ON "challenges" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("challenges"."creator_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "group_members_read" ON "group_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.group_member("group_members"."group_id", (select auth.uid()))
        or exists (select 1 from public.groups g where g.id = "group_members"."group_id" and g.visibility = 'public'));--> statement-breakpoint
CREATE POLICY "group_members_join_public" ON "group_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("group_members"."user_id" = (select auth.uid()) and "group_members"."role" = 'member'
        and exists (select 1 from public.groups g where g.id = "group_members"."group_id" and g.visibility = 'public'));--> statement-breakpoint
CREATE POLICY "group_members_delete" ON "group_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING (("group_members"."user_id" = (select auth.uid()) and "group_members"."role" <> 'owner')
        or (public.group_admin("group_members"."group_id", (select auth.uid())) and "group_members"."role" <> 'owner'));--> statement-breakpoint
CREATE POLICY "groups_read" ON "groups" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("groups"."visibility" = 'public' or "groups"."owner_id" = (select auth.uid()) or public.group_member("groups"."id", (select auth.uid())));--> statement-breakpoint
CREATE POLICY "groups_insert" ON "groups" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("groups"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "groups_admin_update" ON "groups" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.group_admin("groups"."id", (select auth.uid()))) WITH CHECK (public.group_admin("groups"."id", (select auth.uid())));--> statement-breakpoint
CREATE POLICY "groups_owner_delete" ON "groups" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("groups"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "notification_settings_owner_all" ON "notification_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING ("notification_settings"."user_id" = (select auth.uid())) WITH CHECK ("notification_settings"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "notifications_read" ON "notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("notifications"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "notifications_update" ON "notifications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("notifications"."user_id" = (select auth.uid())) WITH CHECK ("notifications"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "notifications_delete" ON "notifications" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("notifications"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "push_subscriptions_owner_all" ON "push_subscriptions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("push_subscriptions"."user_id" = (select auth.uid())) WITH CHECK ("push_subscriptions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "social_sanctions_own_read" ON "social_sanctions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("social_sanctions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "user_badges_read" ON "user_badges" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_badges"."user_id" = (select auth.uid()) or public.social_can_see((select auth.uid()), "user_badges"."user_id"));--> statement-breakpoint
CREATE POLICY "user_levels_read" ON "user_levels" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_levels"."user_id" = (select auth.uid()) or public.social_can_see((select auth.uid()), "user_levels"."user_id"));--> statement-breakpoint
ALTER POLICY "social_profiles_read" ON "social_profiles" TO authenticated USING ("social_profiles"."user_id" = (select auth.uid()) or (not public.social_blocked((select auth.uid()), "social_profiles"."user_id") and not public.social_suspended("social_profiles"."user_id")));