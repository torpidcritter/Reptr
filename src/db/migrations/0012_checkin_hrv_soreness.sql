ALTER TABLE "daily_checkins" ADD COLUMN "hrv_ms" smallint;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "sore_muscles" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD CONSTRAINT "daily_checkins_hrv_range" CHECK ("daily_checkins"."hrv_ms" is null or "daily_checkins"."hrv_ms" between 5 and 300);