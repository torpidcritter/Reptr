CREATE TYPE "public"."meal_type" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TABLE "food_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"meal" "meal_type" DEFAULT 'snack' NOT NULL,
	"name" text NOT NULL,
	"calories" integer DEFAULT 0 NOT NULL,
	"protein_g" numeric(6, 1) DEFAULT 0 NOT NULL,
	"carbs_g" numeric(6, 1) DEFAULT 0 NOT NULL,
	"fat_g" numeric(6, 1) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_entries_calories_range" CHECK ("food_entries"."calories" between 0 and 10000),
	CONSTRAINT "food_entries_macros_range" CHECK ("food_entries"."protein_g" >= 0 and "food_entries"."carbs_g" >= 0 and "food_entries"."fat_g" >= 0 and "food_entries"."protein_g" + "food_entries"."carbs_g" + "food_entries"."fat_g" <= 2000)
);
--> statement-breakpoint
ALTER TABLE "food_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nutrition_targets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"calories" integer,
	"protein_g" numeric(6, 1),
	"carbs_g" numeric(6, 1),
	"fat_g" numeric(6, 1),
	"water_ml" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrition_targets_calories_range" CHECK ("nutrition_targets"."calories" is null or "nutrition_targets"."calories" between 500 and 10000),
	CONSTRAINT "nutrition_targets_water_range" CHECK ("nutrition_targets"."water_ml" is null or "nutrition_targets"."water_ml" between 250 and 10000)
);
--> statement-breakpoint
ALTER TABLE "nutrition_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "water_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"ml" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "water_entries_ml_range" CHECK ("water_entries"."ml" between -5000 and 5000 and "water_entries"."ml" <> 0)
);
--> statement-breakpoint
ALTER TABLE "water_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_targets" ADD CONSTRAINT "nutrition_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "water_entries" ADD CONSTRAINT "water_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_entries_user_day_idx" ON "food_entries" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "water_entries_user_day_idx" ON "water_entries" USING btree ("user_id","day");--> statement-breakpoint
CREATE POLICY "food_entries_owner_all" ON "food_entries" AS PERMISSIVE FOR ALL TO "authenticated" USING ("food_entries"."user_id" = (select auth.uid())) WITH CHECK ("food_entries"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "nutrition_targets_owner_all" ON "nutrition_targets" AS PERMISSIVE FOR ALL TO "authenticated" USING ("nutrition_targets"."user_id" = (select auth.uid())) WITH CHECK ("nutrition_targets"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "water_entries_owner_all" ON "water_entries" AS PERMISSIVE FOR ALL TO "authenticated" USING ("water_entries"."user_id" = (select auth.uid())) WITH CHECK ("water_entries"."user_id" = (select auth.uid()));