CREATE TABLE `review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_item_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`recalled` integer NOT NULL,
	FOREIGN KEY (`quiz_item_id`) REFERENCES `quiz_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_events_quiz_item_id_idx` ON `review_events` (`quiz_item_id`);