CREATE TABLE `dog_clusters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dog_label` text,
	`ignored` integer DEFAULT false NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `dogs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`photo_uuid` text NOT NULL,
	`bbox_x` real NOT NULL,
	`bbox_y` real NOT NULL,
	`bbox_w` real NOT NULL,
	`bbox_h` real NOT NULL,
	`det_score` real NOT NULL,
	`embedding` blob NOT NULL,
	`cluster_id` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_dogs_photo_uuid` ON `dogs` (`photo_uuid`);--> statement-breakpoint
CREATE INDEX `idx_dogs_cluster_id` ON `dogs` (`cluster_id`);--> statement-breakpoint
ALTER TABLE `photos` ADD `dogs_processed_at` integer;--> statement-breakpoint
CREATE INDEX `idx_photos_dogs_processed_at` ON `photos` (`dogs_processed_at`);