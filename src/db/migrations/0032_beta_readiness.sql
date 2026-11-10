CREATE TABLE "device_keys" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sync_stats" (
	"day" date NOT NULL,
	"channel" text NOT NULL,
	"outcome" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sync_stats_day_channel_outcome_pk" PRIMARY KEY("day","channel","outcome")
);
--> statement-breakpoint
ALTER TABLE "sync_stats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "device_keys" ADD CONSTRAINT "device_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;