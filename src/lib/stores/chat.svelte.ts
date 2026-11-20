import { browser } from '$app/env';
import { toast } from 'svelte-sonner';
import { DEFAULT_CHAT_PREFERENCES } from '#lib/constants';
import type { ChatContextMode } from '#lib/enums';
import { SvelteMap } from 'svelte/reactivity';
import { ChatPreferencesService, ChatService } from '#lib/services';
import type {
	AgentGoal,
	AgentProgressEvent,
	AgentTraceItem,
	ApiChatMessageRequest,
	ApiChatStreamEvent,
	ChatPreferences,
	Session,
	SessionMessage,
	UserMessageMetadata
} from '#lib/types';

class ChatConversation {
	session = $state<Session | undefined>(undefined);
	messages = $state<SessionMessage[]>([]);
	streamedText = $state('');
	liveTrace = $state<AgentTraceItem[]>([]);
	goals = $state<AgentGoal[]>([]);
	agentStatus = $state('Thinking…');
	error = $state<string | null>(null);
	isStreaming = $state(false);
	removed = false;
	private messageLoad = 0;
	private generationController: AbortController | null = null;

	async loadMessages(): Promise<void> {
		if (!this.session || this.removed) return;
		const load = ++this.messageLoad;
		this.error = null;
		const messages = await ChatService.getMessages(this.session.id);
		if (load === this.messageLoad && !this.removed) this.messages = messages;
	}

	async sendMessage(
		request: ApiChatMessageRequest,
		userMetadata: UserMessageMetadata | null = null
	): Promise<void> {
		if (!this.session) throw new Error('A chat session is required.');
		if (this.isStreaming || this.removed) return;
		const sessionId = this.session.id;
		const controller = new AbortController();
		this.generationController = controller;
		this.messageLoad += 1;
		this.appendLocalMessage(sessionId, 'user', request.message, userMetadata);
		this.isStreaming = true;
		this.streamedText = '';
		this.liveTrace = [];
		this.goals = [];
		this.error = null;
		this.agentStatus = 'Thinking…';

		// Starts on `complete`, while the server may still be generating the
		// title, so the composer unlocks as soon as the answer is saved.
		let finishing: Promise<void> | null = null;
		try {
			for await (const event of ChatService.streamMessage(sessionId, request, controller.signal)) {
				if (event.type === 'error') throw new Error(event.message);
				this.applyStreamEvent(event);
				if (event.type === 'complete') {
					finishing = this.finish(event.saved);
					finishing.catch(() => undefined);
				}
			}
			controller.signal.throwIfAborted();
			await (finishing ??= this.finish(true));
		} catch (error) {
			if (!controller.signal.aborted) {
				this.error = error instanceof Error ? error.message : String(error);
				this.agentStatus = 'Agent run failed';
				throw error;
			}
			if (!finishing) {
				this.agentStatus = 'Generation stopped';
				if (this.streamedText) this.appendLocalMessage(sessionId, 'assistant', this.streamedText);
			}
		} finally {
			if (this.generationController === controller) this.generationController = null;
			if (!finishing) {
				this.isStreaming = false;
				this.streamedText = '';
			}
		}
	}

	stopGeneration(): void {
		if (!this.isStreaming) return;
		this.generationController?.abort();
	}

	private async finish(saved: boolean): Promise<void> {
		try {
			if (saved) await this.loadMessages();
		} finally {
			// An unsaved answer (the conversation was removed mid-stream) stays on screen.
			if (saved) this.streamedText = '';
			this.isStreaming = false;
		}
	}

	private appendLocalMessage(
		sessionId: string,
		role: 'user' | 'assistant',
		content: string,
		metadata: UserMessageMetadata | null = null
	): void {
		const id = (this.messages.at(-1)?.id ?? 0) + 1;
		this.messages = [
			...this.messages,
			{ id, sessionId, role, content, metadata, createdAt: new Date() }
		];
	}

	private applyStreamEvent(event: Exclude<ApiChatStreamEvent, { type: 'error' }>): void {
		switch (event.type) {
			case 'agent':
				if (event.progress.trace) this.upsertTrace(event.progress.trace);
				if (event.progress.kind === 'model') this.agentStatus = modelStatus(event.progress);
				break;
			case 'text':
				this.streamedText += event.delta;
				this.agentStatus = 'Writing final response';
				break;
			case 'text-reset':
				this.streamedText = '';
				break;
			case 'goals':
				this.goals = event.goals;
				break;
			case 'title':
				if (this.session) {
					this.session = { ...this.session, title: event.title, updatedAt: new Date() };
				}
				break;
			case 'complete': {
				if (!event.saved) {
					this.agentStatus = 'Finished · not saved (the conversation was removed)';
					break;
				}
				const turns = event.modelTurns === 1 ? 'turn' : 'turns';
				const calls = event.toolCalls === 1 ? 'call' : 'calls';
				this.agentStatus = `Finished · ${event.modelTurns} model ${turns}, ${event.toolCalls} tool ${calls}`;
				break;
			}
		}
	}

	private upsertTrace(item: AgentTraceItem): void {
		const index = this.liveTrace.findIndex(({ id }) => id === item.id);
		this.liveTrace =
			index === -1
				? [...this.liveTrace, item]
				: this.liveTrace.map((entry, current) => (current === index ? item : entry));
	}
}

class ChatStore {
	private conversations = new SvelteMap<string, ChatConversation>();
	current = $state(new ChatConversation());
	private preferences = $state<ChatPreferences>({ ...DEFAULT_CHAT_PREFERENCES });
	private loading = false;
	ready = $state(false);

	async init(): Promise<void> {
		if (!browser || this.ready || this.loading) return;
		this.loading = true;
		try {
			this.preferences = await ChatPreferencesService.get();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			this.loading = false;
			this.ready = true;
		}
	}

	get session(): Session | undefined {
		return this.current.session;
	}

	set session(value: Session | undefined) {
		if (!value) {
			if (this.session) this.current = new ChatConversation();
			return;
		}
		let conversation = this.conversations.get(value.id);
		if (!conversation) {
			conversation = new ChatConversation();
			this.conversations.set(value.id, conversation);
		}
		conversation.session = value;
		this.current = conversation;
	}

	get toolsEnabled(): boolean {
		return this.preferences.toolsEnabled;
	}

	set toolsEnabled(value: boolean) {
		if (this.preferences.toolsEnabled === value) return;
		this.preferences.toolsEnabled = value;
		void this.savePreferences();
	}

	get mode(): ChatContextMode {
		return this.preferences.mode;
	}

	set mode(value: ChatContextMode) {
		if (this.preferences.mode === value) return;
		this.preferences.mode = value;
		void this.savePreferences();
	}

	private async savePreferences(): Promise<void> {
		try {
			await ChatPreferencesService.update($state.snapshot(this.preferences));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async loadMessages(): Promise<void> {
		if (!this.current.isStreaming) await this.current.loadMessages();
	}

	forgetSession(sessionId: string): void {
		const conversation = this.conversations.get(sessionId);
		if (!conversation) return;
		conversation.removed = true;
		this.conversations.delete(sessionId);
		if (this.current === conversation) this.current = new ChatConversation();
	}
}

function modelStatus(progress: Extract<AgentProgressEvent, { kind: 'model' }>): string {
	if (progress.status === 'started') return 'Thinking…';
	if (progress.requestedTools?.length) return 'Starting tools…';
	return 'Writing response…';
}

export const chatStore = new ChatStore();
