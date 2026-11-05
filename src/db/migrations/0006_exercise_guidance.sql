CREATE TYPE "public"."difficulty" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "common_mistakes" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "safety_notes" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "difficulty" "difficulty";