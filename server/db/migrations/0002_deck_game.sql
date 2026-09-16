ALTER TABLE `decks` ADD `game` text DEFAULT 'mtg' NOT NULL;--> statement-breakpoint
CREATE INDEX `decks_public_game_idx` ON `decks` (`public`,`game`);