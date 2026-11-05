ALTER TYPE "public"."set_type" ADD VALUE 'rest_pause';--> statement-breakpoint
ALTER TABLE "workout_sets" ADD COLUMN "rir" integer;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD COLUMN "tempo" text;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_rir_range" CHECK ("workout_sets"."rir" is null or "workout_sets"."rir" between 0 and 10);--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_tempo_format" CHECK ("workout_sets"."tempo" is null or "workout_sets"."tempo" ~ '^[0-9X]{4}$');--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_notes_length" CHECK ("workout_sets"."notes" is null or char_length("workout_sets"."notes") <= 200);