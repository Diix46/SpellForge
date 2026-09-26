CREATE TABLE `wishlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`printing_id` text NOT NULL,
	`any_printing` integer DEFAULT true NOT NULL,
	`finish` text DEFAULT 'nonfoil' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`target_price` real,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wishlist_card_idx` ON `wishlist_items` (`user_id`,`game`,`printing_id`,`finish`);