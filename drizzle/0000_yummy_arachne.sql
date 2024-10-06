CREATE TABLE IF NOT EXISTS "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(256),
	"size" varchar(256),
	"type" varchar(256),
	"color" varchar(256)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "name_idx" ON "items" USING btree ("user_id");