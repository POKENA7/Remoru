CREATE TABLE `import_daily_usage` (
	`user_id` text NOT NULL,
	`day` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`user_id`, `day`)
);
--> statement-breakpoint
CREATE TABLE `import_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_tokens_token_hash_unique` ON `import_tokens` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `import_tokens_user_id_unique` ON `import_tokens` (`user_id`);