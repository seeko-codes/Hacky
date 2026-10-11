ALTER TABLE "profiles" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_photo_url_format" CHECK ("profiles"."photo_url" ~ '^(/assets/|https://)');