CREATE TYPE "public"."goal_kind" AS ENUM('strength', 'bodyweight', 'consistency');--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "goal_kind" NOT NULL,
	"exercise_id" uuid,
	"target_value" numeric(8, 2) NOT NULL,
	"start_value" numeric(8, 2),
	"target_date" date,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_strength_has_exercise" CHECK (("goals"."kind" = 'strength') = ("goals"."exercise_id" is not null)),
	CONSTRAINT "goals_target_positive" CHECK ("goals"."target_value" > 0)
);
--> statement-breakpoint
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "goals_owner_all" ON "goals" AS PERMISSIVE FOR ALL TO "authenticated" USING ("goals"."user_id" = (select auth.uid())) WITH CHECK ("goals"."user_id" = (select auth.uid()));