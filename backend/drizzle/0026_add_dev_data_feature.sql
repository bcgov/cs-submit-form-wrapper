CREATE TABLE "soba"."dev_data_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"size" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"ids" jsonb DEFAULT '{"workspaceIds":[],"userIds":[]}'::jsonb NOT NULL,
	"manifest" jsonb,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "soba"."dev_data_run" ADD CONSTRAINT "dev_data_run_owner_user_id_app_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "soba"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "soba"."feature" ("code","name","description","version","status","created_by","updated_by") VALUES
	('dev-data','Development data','Generated workspaces, forms and submissions for development and integration testing',NULL,'disabled','SOBA System (seed)','SOBA System (seed)')
ON CONFLICT DO NOTHING;
