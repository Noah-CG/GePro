CREATE TABLE "important_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#dc2626' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "important_days_project_date_uq" UNIQUE("project_id","date"),
	CONSTRAINT "important_days_title_length" CHECK (char_length("important_days"."title") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "important_days" ADD CONSTRAINT "important_days_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "important_days" ADD CONSTRAINT "important_days_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;