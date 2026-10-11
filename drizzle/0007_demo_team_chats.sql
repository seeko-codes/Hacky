ALTER TYPE "public"."conversation_kind" ADD VALUE 'team';--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_shape";--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_team_id_unique" UNIQUE("team_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_shape" CHECK (("conversations"."kind"::text = 'dm' and "conversations"."dm_user_low" is not null and "conversations"."dm_user_high" is not null and "conversations"."dm_user_low" < "conversations"."dm_user_high" and "conversations"."help_request_id" is null and "conversations"."team_id" is null)
        or ("conversations"."kind"::text = 'mentor' and "conversations"."help_request_id" is not null and "conversations"."dm_user_low" is null and "conversations"."dm_user_high" is null and "conversations"."team_id" is null)
        or ("conversations"."kind"::text = 'team' and "conversations"."team_id" is not null and "conversations"."help_request_id" is null and "conversations"."dm_user_low" is null and "conversations"."dm_user_high" is null));