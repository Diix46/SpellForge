DROP INDEX `collection_copy_idx`;--> statement-breakpoint
ALTER TABLE `collection_items` ADD `lang` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `collection_copy_idx` ON `collection_items` (`user_id`,`game`,`printing_id`,`finish`,`condition`,`lang`);