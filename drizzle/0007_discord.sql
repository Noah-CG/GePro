CREATE TABLE "discord_read_state" (
	"user_id" uuid NOT NULL,
	"channel_id" text NOT NULL,
	"last_read_message_id" text NOT NULL,
	CONSTRAINT "discord_read_state_user_id_channel_id_pk" PRIMARY KEY("user_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "project_discord" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"channel_name" text NOT NULL,
	"webhook_id" text NOT NULL,
	"webhook_token_enc" text NOT NULL,
	"linked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_read_state" ADD CONSTRAINT "discord_read_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_discord" ADD CONSTRAINT "project_discord_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_discord" ADD CONSTRAINT "project_discord_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;