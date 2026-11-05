CREATE TABLE "saved_foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'food' NOT NULL,
	"name" text NOT NULL,
	"serving_label" text DEFAULT '1 serving' NOT NULL,
	"calories" integer NOT NULL,
	"protein_g" numeric(6, 1) DEFAULT 0 NOT NULL,
	"carbs_g" numeric(6, 1) DEFAULT 0 NOT NULL,
	"fat_g" numeric(6, 1) DEFAULT 0 NOT NULL,
	"servings" numeric(4, 1),
	"ingredients" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_foods_kind" CHECK ("saved_foods"."kind" in ('food', 'recipe')),
	CONSTRAINT "saved_foods_calories_range" CHECK ("saved_foods"."calories" between 0 and 10000),
	CONSTRAINT "saved_foods_recipe_shape" CHECK (("saved_foods"."kind" = 'recipe') = ("saved_foods"."ingredients" is not null))
);
--> statement-breakpoint
ALTER TABLE "saved_foods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_foods" ADD CONSTRAINT "saved_foods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_foods_user_name_key" ON "saved_foods" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE POLICY "saved_foods_owner_all" ON "saved_foods" AS PERMISSIVE FOR ALL TO "authenticated" USING ("saved_foods"."user_id" = (select auth.uid())) WITH CHECK ("saved_foods"."user_id" = (select auth.uid()));