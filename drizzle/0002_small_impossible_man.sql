ALTER TABLE `documents` ADD `local_only` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `local_only` integer DEFAULT false NOT NULL;