ALTER TABLE `photos` ADD `content_hash` text;--> statement-breakpoint
CREATE INDEX `idx_photos_content_hash` ON `photos` (`content_hash`);