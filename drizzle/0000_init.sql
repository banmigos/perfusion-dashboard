CREATE TABLE `application_cycles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`program_id` integer NOT NULL,
	`cycle_label` text NOT NULL,
	`entry_year` integer,
	`application_opens_date` text,
	`deadline_date` text,
	`deadline_time_local` text,
	`deadline_timezone` text,
	`deadline_type` text,
	`cas_service` text,
	`decision_notification_date` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `application_cycles_deadline_date_idx` ON `application_cycles` (`deadline_date`);--> statement-breakpoint
CREATE INDEX `application_cycles_entry_year_idx` ON `application_cycles` (`entry_year`);--> statement-breakpoint
CREATE UNIQUE INDEX `application_cycles_program_label_unique` ON `application_cycles` (`program_id`,`cycle_label`);--> statement-breakpoint
CREATE TABLE `prerequisite_courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cycle_id` integer NOT NULL,
	`subject` text NOT NULL,
	`min_credits` real,
	`lab_required` integer,
	`min_grade` text,
	`recency_years` integer,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `application_cycles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `programs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`school_id` integer NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`legacy_key` text,
	`credential` text,
	`modality` text,
	`accreditation_status` text,
	`cae_accredited` integer,
	`program_length_months` integer,
	`class_size` integer,
	`website_url` text,
	`latitude` real,
	`longitude` real,
	`status` text DEFAULT 'draft' NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `programs_credential_idx` ON `programs` (`credential`);--> statement-breakpoint
CREATE UNIQUE INDEX `programs_school_slug_unique` ON `programs` (`school_id`,`slug`);--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cycle_id` integer NOT NULL,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`value_text` text,
	`value_number` real,
	`value_bool` integer,
	`value_date` text,
	`unit` text,
	`is_required` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `application_cycles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `requirements_cycle_category_idx` ON `requirements` (`cycle_id`,`category`);--> statement-breakpoint
CREATE TABLE `schools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`city` text,
	`state` text,
	`country` text DEFAULT 'US' NOT NULL,
	`website_url` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schools_slug_unique` ON `schools` (`slug`);--> statement-breakpoint
CREATE TABLE `tuition_estimates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`program_id` integer NOT NULL,
	`cycle_id` integer,
	`residency` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`covers` text NOT NULL,
	`deposit_cents` integer,
	`fees_note` text,
	`as_of_year` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cycle_id`) REFERENCES `application_cycles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_table` text NOT NULL,
	`subject_id` integer NOT NULL,
	`field_key` text NOT NULL,
	`state` text NOT NULL,
	`source_id` integer,
	`quote` text,
	`note` text,
	`checked_at` integer,
	`verification` text DEFAULT 'draft' NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`confidence` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "claims_known_requires_source" CHECK(("claims"."state" != 'known') OR ("claims"."source_id" IS NOT NULL)),
	CONSTRAINT "claims_verified_requires_checked_at" CHECK(("claims"."verification" = 'draft') OR ("claims"."checked_at" IS NOT NULL)),
	CONSTRAINT "claims_subject_table_known" CHECK("claims"."subject_table" IN ('schools','programs','application_cycles','requirements','prerequisite_courses','tuition_estimates'))
);
--> statement-breakpoint
CREATE INDEX `claims_verification_idx` ON `claims` (`verification`);--> statement-breakpoint
CREATE INDEX `claims_checked_at_idx` ON `claims` (`checked_at`);--> statement-breakpoint
CREATE INDEX `claims_subject_idx` ON `claims` (`subject_table`,`subject_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `claims_subject_field_unique` ON `claims` (`subject_table`,`subject_id`,`field_key`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`canonical_url` text,
	`title` text,
	`publisher` text,
	`source_type` text NOT NULL,
	`fetched_at` integer,
	`content_hash` text,
	`snapshot_path` text,
	`notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_url_unique` ON `sources` (`url`);--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`checklist_id` integer NOT NULL,
	`title` text NOT NULL,
	`detail` text,
	`category` text,
	`due_at` integer,
	`status` text DEFAULT 'todo' NOT NULL,
	`completed_at` integer,
	`link_url` text,
	`derived_from_requirement_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`checklist_id`) REFERENCES `personal_checklists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`derived_from_requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `checklist_items_status_due_idx` ON `checklist_items` (`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `personal_checklists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`saved_program_id` integer NOT NULL,
	`cycle_id` integer,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`saved_program_id`) REFERENCES `saved_programs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cycle_id`) REFERENCES `application_cycles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `saved_programs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`program_id` integer NOT NULL,
	`added_at` integer NOT NULL,
	`priority` text,
	`personal_note` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_programs_user_program_unique` ON `saved_programs` (`user_id`,`program_id`);--> statement-breakpoint
CREATE TABLE `change_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`actor` text,
	`action` text NOT NULL,
	`subject_table` text NOT NULL,
	`subject_id` integer NOT NULL,
	`field_key` text,
	`before_json` text,
	`after_json` text,
	`batch_id` integer,
	`note` text,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `change_log_subject_idx` ON `change_log` (`subject_table`,`subject_id`);--> statement-breakpoint
CREATE INDEX `change_log_at_idx` ON `change_log` (`at`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`mode` text NOT NULL,
	`source_label` text NOT NULL,
	`file_hash` text,
	`actor` text,
	`summary_json` text,
	`status` text DEFAULT 'running' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_conflicts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`subject_table` text NOT NULL,
	`subject_id` integer NOT NULL,
	`field_key` text NOT NULL,
	`current_json` text,
	`proposed_json` text,
	`reason` text,
	`resolved_at` integer,
	`resolution` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `users` (`name`, `created_at`) VALUES ('Owner', unixepoch() * 1000);
