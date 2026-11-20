import { ChatContextMode } from '#lib/enums';

export const CHAT_HISTORY_MESSAGE_LIMIT = 20;
export const NEW_CHAT_TITLE = 'New conversation';

export const CHAT_MODES = [
	ChatContextMode.NOTEBOOK,
	ChatContextMode.SEARCH,
	ChatContextMode.MODEL
] as const;

export const DEFAULT_CHAT_PREFERENCES = {
	mode: ChatContextMode.SEARCH,
	toolsEnabled: false
} as const;
