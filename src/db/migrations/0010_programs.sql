CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"weeks" smallint NOT NULL,
	"deload_every" smallint,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_weeks_range" CHECK ("programs"."weeks" between 2 and 16),
	CONSTRAINT "programs_deload_range" CHECK ("programs"."deload_every" is null or "programs"."deload_every" between 3 and 8)
);
--> statement-breakpoint
ALTER TABLE "programs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "programs_user_idx" ON "programs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_one_active" ON "programs" USING btree ("user_id") WHERE "programs"."archived_at" is null;--> statement-breakpoint
CREATE POLICY "programs_owner_all" ON "programs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("programs"."user_id" = (select auth.uid())) WITH CHECK ("programs"."user_id" = (select auth.uid()));