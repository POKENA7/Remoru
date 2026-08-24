CREATE TABLE `tag_suggestion_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`dismissed_at_count` integer,
	`dismissed_at` integer
);
