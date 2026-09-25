CREATE TABLE `import_rate_limits` (
	`token_id` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`token_id`, `window_start`),
	FOREIGN KEY (`token_id`) REFERENCES `import_tokens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `import_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_tokens_token_hash_unique` ON `import_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `import_tokens_user_id_idx` ON `import_tokens` (`user_id`);