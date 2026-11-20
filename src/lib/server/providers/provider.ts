import { reasoningEffortForBudget, type ReasoningEffort } from '#lib/constants';
import type { LlamaGpuMode } from '#lib/types';

export type ProviderChatOptions = {
	temperature?: number;
	topK?: number;
	maxTokens?: number;
	reasoningBudget?: number;
	gpuMode?: LlamaGpuMode;
	tools?: ProviderToolDefinition[];
	signal?: AbortSignal;
};

export type ProviderToolDefinition = {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
};

export type ProviderToolCall = {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
};

export type ProviderChatMessage = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | null;
	reasoning_content?: string;
	tool_calls?: ProviderToolCall[];
	tool_call_id?: string;
	name?: string;
};

export type ProviderProgress = {
	kind: 'thinking' | 'text';
	text: string;
};

export type ProviderReply = {
	content: string | null;
	thinking: string | null;
	toolCalls: ProviderToolCall[];
};

export type ProviderEffort = Exclude<ReasoningEffort, 'default'>;

export abstract class Provider {
	abstract id: string;
	abstract name: string;

	abstract complete(
		model: string,
		messages: ProviderChatMessage[],
		options: ProviderChatOptions,
		onProgress: (progress: ProviderProgress) => void
	): Promise<ProviderReply>;

	abstract models(): Promise<string[]>;
}

export function requestedEffort(options: ProviderChatOptions): ProviderEffort | undefined {
	const budget = options.reasoningBudget;
	if (budget === undefined || budget <= 0) return undefined;

	const effort = reasoningEffortForBudget(budget);
	return effort === 'default' ? undefined : effort;
}
