-- Readings so far store the person's wall-clock time as if it were UTC, so the UTC date
-- and time of recorded_at are their own day and time. Midday exactly means "no time given".
ALTER TABLE "body_metrics" ADD COLUMN "recorded_on" date;--> statement-breakpoint
ALTER TABLE "body_metrics" ADD COLUMN "recorded_time" time;--> statement-breakpoint
UPDATE "body_metrics" SET
  "recorded_on" = ("recorded_at" AT TIME ZONE 'UTC')::date,
  "recorded_time" = CASE
    WHEN ("recorded_at" AT TIME ZONE 'UTC')::time = '12:00:00' THEN NULL
    ELSE date_trunc('minute', "recorded_at" AT TIME ZONE 'UTC')::time
  END;--> statement-breakpoint
ALTER TABLE "body_metrics" ALTER COLUMN "recorded_on" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "body_metrics_user_type_day_idx" ON "body_metrics" USING btree ("user_id","type","recorded_on" DESC NULLS LAST);
