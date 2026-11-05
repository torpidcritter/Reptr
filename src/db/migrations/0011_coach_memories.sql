CREATE TABLE "coach_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_memories_kind" CHECK ("coach_memories"."kind" in ('injury', 'preference', 'equipment', 'schedule', 'other')),
	CONSTRAINT "coach_memories_length" CHECK (char_length("coach_memories"."content") between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "coach_memories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_memories" ADD CONSTRAINT "coach_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_memories_user_idx" ON "coach_memories" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "coach_memories_owner_all" ON "coach_memories" AS PERMISSIVE FOR ALL TO "authenticated" USING ("coach_memories"."user_id" = (select auth.uid())) WITH CHECK ("coach_memories"."user_id" = (select auth.uid()));