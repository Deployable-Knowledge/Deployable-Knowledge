PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`provider` text(128) DEFAULT 'ollama' NOT NULL,
	`model` text(128) DEFAULT '' NOT NULL,
	`max_tokens` integer DEFAULT 4096 NOT NULL,
	`temperature` real DEFAULT 0.2 NOT NULL,
	`top_k` integer DEFAULT 8 NOT NULL,
	`reasoning_budget` integer DEFAULT 512 NOT NULL,
	`retrieval_mode` text DEFAULT 'hybrid' NOT NULL,
	`rag_top_k` integer DEFAULT 5 NOT NULL,
	`agent_max_turns` integer DEFAULT 6 NOT NULL,
	`gpu_mode` text DEFAULT 'auto' NOT NULL,
	`enabled_tools` text DEFAULT '[]' NOT NULL,
	`prompt_template_id` text,
	`persona` text(1024),
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`prompt_template_id`) REFERENCES `prompt_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_profiles`("id", "name", "provider", "model", "max_tokens", "temperature", "top_k", "reasoning_budget", "retrieval_mode", "rag_top_k", "agent_max_turns", "gpu_mode", "enabled_tools", "prompt_template_id", "persona", "created_at", "updated_at") SELECT "id", "name", "provider", "model", "max_tokens", "temperature", "top_k", "reasoning_budget", "retrieval_mode", "rag_top_k", "agent_max_turns", "gpu_mode", "enabled_tools", "prompt_template_id", "persona", "created_at", "updated_at" FROM `profiles`;--> statement-breakpoint
DROP TABLE `profiles`;--> statement-breakpoint
ALTER TABLE `__new_profiles` RENAME TO `profiles`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `profiles_updated_idx` ON `profiles` (`updated_at`);