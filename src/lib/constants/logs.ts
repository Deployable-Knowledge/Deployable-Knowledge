export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export const LOG_SUBSYSTEMS = [
	'application',
	'chat',
	'documents',
	'embedding',
	'folder-sync',
	'models',
	'ocr',
	'search'
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogSubsystem = (typeof LOG_SUBSYSTEMS)[number];
