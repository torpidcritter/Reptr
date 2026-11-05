ALTER TYPE "public"."training_goal" ADD VALUE 'maintenance';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "training_days" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "equipment" text[] DEFAULT '{}'::text[] NOT NULL;