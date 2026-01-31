CREATE INDEX `idx_photos_date_captured` ON `photos` (`date_captured`);--> statement-breakpoint
CREATE INDEX `idx_photos_camera` ON `photos` (`camera`);--> statement-breakpoint
CREATE INDEX `idx_photos_lens` ON `photos` (`lens`);--> statement-breakpoint
CREATE INDEX `idx_photos_iso` ON `photos` (`iso`);--> statement-breakpoint
CREATE INDEX `idx_photos_aperture` ON `photos` (`aperture`);--> statement-breakpoint
CREATE INDEX `idx_photos_rating` ON `photos` (`rating`);--> statement-breakpoint
CREATE INDEX `idx_photos_label` ON `photos` (`label`);--> statement-breakpoint
CREATE INDEX `idx_photos_aspect_ratio` ON `photos` (`aspect_ratio`);--> statement-breakpoint
CREATE INDEX `idx_photos_created_at` ON `photos` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_photos_filename` ON `photos` (`filename`);