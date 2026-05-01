CREATE TABLE `face_clusters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_label` text,
	`ignored` integer DEFAULT false NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `faces` (
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
CREATE INDEX `idx_faces_photo_uuid` ON `faces` (`photo_uuid`);--> statement-breakpoint
CREATE INDEX `idx_faces_cluster_id` ON `faces` (`cluster_id`);--> statement-breakpoint
ALTER TABLE `photos` ADD `faces_processed_at` integer;--> statement-breakpoint
CREATE INDEX `idx_photos_faces_processed_at` ON `photos` (`faces_processed_at`);