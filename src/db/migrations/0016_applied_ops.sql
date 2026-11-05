CREATE TABLE "applied_ops" (
	"user_id" uuid NOT NULL,
	"op_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applied_ops_user_id_op_id_pk" PRIMARY KEY("user_id","op_id")
);
--> statement-breakpoint
ALTER TABLE "applied_ops" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applied_ops" ADD CONSTRAINT "applied_ops_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "applied_ops_owner_all" ON "applied_ops" AS PERMISSIVE FOR ALL TO "authenticated" USING ("applied_ops"."user_id" = (select auth.uid())) WITH CHECK ("applied_ops"."user_id" = (select auth.uid()));