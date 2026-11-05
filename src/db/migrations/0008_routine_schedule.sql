ALTER TABLE "routines" ADD COLUMN "schedule_days" smallint[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "schedule_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_schedule_days_valid" CHECK ("routines"."schedule_days" <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]);