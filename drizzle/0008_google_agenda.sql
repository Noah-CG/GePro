CREATE TYPE "public"."calendar_tasks_mode" AS ENUM('mine', 'all', 'none');--> statement-breakpoint
CREATE TABLE "google_calendar_sync_projects" (
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "google_calendar_sync_projects_user_id_project_id_pk" PRIMARY KEY("user_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "google_calendar_syncs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"calendar_id" text,
	"tasks_mode" "calendar_tasks_mode" DEFAULT 'mine' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_calendar_sync_projects" ADD CONSTRAINT "google_calendar_sync_projects_user_id_google_calendar_syncs_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."google_calendar_syncs"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_sync_projects" ADD CONSTRAINT "google_calendar_sync_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_syncs" ADD CONSTRAINT "google_calendar_syncs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_calendar_sync_projects_project_idx" ON "google_calendar_sync_projects" USING btree ("project_id");