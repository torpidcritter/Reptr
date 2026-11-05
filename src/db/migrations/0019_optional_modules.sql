ALTER TABLE "profiles" ADD COLUMN "track_nutrition" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "track_recovery" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Keep the modules on for anyone already using them.
UPDATE "profiles" p SET "track_nutrition" = true WHERE EXISTS (SELECT 1 FROM "food_entries" f WHERE f."user_id" = p."user_id") OR EXISTS (SELECT 1 FROM "water_entries" w WHERE w."user_id" = p."user_id") OR EXISTS (SELECT 1 FROM "nutrition_targets" t WHERE t."user_id" = p."user_id");--> statement-breakpoint
UPDATE "profiles" p SET "track_recovery" = true WHERE EXISTS (SELECT 1 FROM "daily_checkins" c WHERE c."user_id" = p."user_id");
