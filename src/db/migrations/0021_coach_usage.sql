CREATE TABLE "coach_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_usage_tokens" CHECK ("coach_usage"."prompt_tokens" >= 0 and "coach_usage"."completion_tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "coach_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_usage" ADD CONSTRAINT "coach_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_usage_user_created_idx" ON "coach_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "coach_usage_created_idx" ON "coach_usage" USING btree ("created_at");--> statement-breakpoint
CREATE POLICY "coach_usage_owner_read" ON "coach_usage" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("coach_usage"."user_id" = (select auth.uid()));