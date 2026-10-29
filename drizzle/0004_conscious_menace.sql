CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(48) NOT NULL,
	`description` text(512) DEFAULT '' NOT NULL,
	`instructions` text NOT NULL,
	`model_invocable` integer DEFAULT true NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_name_unique` ON `skills` (`name`);