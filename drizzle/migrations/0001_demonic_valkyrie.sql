CREATE TABLE `quiz_items` (
	`id` text PRIMARY KEY NOT NULL,
	`memo_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`memo_id`) REFERENCES `memos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_items_memo_id_unique` ON `quiz_items` (`memo_id`);--> statement-breakpoint
CREATE TABLE `review_schedules` (
	`quiz_item_id` text PRIMARY KEY NOT NULL,
	`next_review_at` integer NOT NULL,
	`state` text NOT NULL,
	FOREIGN KEY (`quiz_item_id`) REFERENCES `quiz_items`(`id`) ON UPDATE no action ON DELETE cascade
);
