CREATE TABLE `collection_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`printing_id` text NOT NULL,
	`finish` text DEFAULT 'nonfoil' NOT NULL,
	`condition` text DEFAULT 'NM' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`purchase_price` real,
	`location` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_copy_idx` ON `collection_items` (`user_id`,`game`,`printing_id`,`finish`,`condition`);--> statement-breakpoint
CREATE INDEX `collection_user_game_idx` ON `collection_items` (`user_id`,`game`);