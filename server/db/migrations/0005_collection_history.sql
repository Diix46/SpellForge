CREATE TABLE `collection_prices` (
	`printing_id` text NOT NULL,
	`finish` text NOT NULL,
	`day` text NOT NULL,
	`price` real NOT NULL,
	PRIMARY KEY(`printing_id`, `finish`, `day`)
);
--> statement-breakpoint
CREATE INDEX `collection_prices_day_idx` ON `collection_prices` (`day`);--> statement-breakpoint
CREATE TABLE `collection_snapshots` (
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`day` text NOT NULL,
	`value` real NOT NULL,
	`paid` real NOT NULL,
	`copies` integer NOT NULL,
	`cards` integer NOT NULL,
	PRIMARY KEY(`user_id`, `game`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
