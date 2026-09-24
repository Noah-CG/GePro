CREATE TYPE "public"."file_status" AS ENUM('uploading', 'ready');--> statement-breakpoint
CREATE TABLE "project_file_chunks" (
	"file_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"data" "bytea" NOT NULL,
	CONSTRAINT "project_file_chunks_file_id_position_pk" PRIMARY KEY("file_id","position")
);
--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"size" integer NOT NULL,
	"chunk_count" integer NOT NULL,
	"status" "file_status" DEFAULT 'uploading' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_file_chunks" ADD CONSTRAINT "project_file_chunks_file_id_project_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."project_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_files_project_idx" ON "project_files" USING btree ("project_id");