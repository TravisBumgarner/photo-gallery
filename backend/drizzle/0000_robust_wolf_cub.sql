CREATE TABLE `photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`filename` text NOT NULL,
	`original_path` text NOT NULL,
	`thumbnail_path` text NOT NULL,
	`blurhash` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`aspect_ratio` real NOT NULL,
	`camera` text,
	`lens` text,
	`date_captured` integer,
	`iso` integer,
	`shutter_speed` text,
	`aperture` real,
	`focal_length` real,
	`keywords` text,
	`rating` integer,
	`label` text,
	`file_size` integer,
	`mime_type` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photos_uuid_unique` ON `photos` (`uuid`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);