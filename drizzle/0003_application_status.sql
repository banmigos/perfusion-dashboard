ALTER TABLE `saved_programs` ADD `application_status` text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE `saved_programs` ADD `status_changed_at` integer;