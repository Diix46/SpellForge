CREATE TABLE `deck_likes` (
	`user_id` text NOT NULL,
	`deck_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `deck_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deck_likes_deck_idx` ON `deck_likes` (`deck_id`);--> statement-breakpoint
ALTER TABLE `collection_items` ADD `featured` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `collection_items` ADD `for_trade` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `profile_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `profile_public` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `collection_public` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_profile_id_unique` ON `users` (`profile_id`);