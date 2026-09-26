CREATE TABLE `collection_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`format` text NOT NULL,
	`filename` text,
	`lines` integer NOT NULL,
	`copies` integer NOT NULL,
	`items` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collection_imports_user_idx` ON `collection_imports` (`user_id`,`game`,`created_at`);