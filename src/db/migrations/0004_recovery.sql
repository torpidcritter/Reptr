CREATE TABLE "daily_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"sleep_hours" numeric(4, 2),
	"sleep_quality" smallint,
	"energy" smallint,
	"soreness" smallint,
	"stress" smallint,
	"steps" integer,
	"resting_hr" smallint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_checkins_user_day_key" UNIQUE("user_id","day"),
	CONSTRAINT "daily_checkins_sleep_range" CHECK ("daily_checkins"."sleep_hours" is null or "daily_checkins"."sleep_hours" between 0 and 24),
	CONSTRAINT "daily_checkins_scores_range" CHECK (coalesce("daily_checkins"."sleep_quality", 1) between 1 and 5 and coalesce("daily_checkins"."energy", 1) between 1 and 5 and coalesce("daily_checkins"."soreness", 1) between 1 and 5 and coalesce("daily_checkins"."stress", 1) between 1 and 5),
	CONSTRAINT "daily_checkins_steps_range" CHECK ("daily_checkins"."steps" is null or "daily_checkins"."steps" between 0 and 200000),
	CONSTRAINT "daily_checkins_hr_range" CHECK ("daily_checkins"."resting_hr" is null or "daily_checkins"."resting_hr" between 25 and 200)
);
--> statement-breakpoint
ALTER TABLE "daily_checkins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD CONSTRAINT "daily_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "daily_checkins_owner_all" ON "daily_checkins" AS PERMISSIVE FOR ALL TO "authenticated" USING ("daily_checkins"."user_id" = (select auth.uid())) WITH CHECK ("daily_checkins"."user_id" = (select auth.uid()));