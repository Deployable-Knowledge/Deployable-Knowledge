import type { CustomProviderRecord } from '#lib/server/database/schema';
import { bearerHeaders, generateToolCallId, listModels, remoteError, send } from './endpoint';
import {
	Provider,
	requestedEffort,
	type ProviderChatMessage,
	type ProviderChatOptions,
	type ProviderProgress,
	type ProviderReply
} from './provider';
import { Collector, serverSentEvents } from './stream';

type Chunk = {
	choices?: { delta: ChunkDelta }[];
	error?: { message: string };
};

type ChunkDelta = {
	content?: string | null;
	reasoning_content?: string | null;
	reasoning?: string | null;
	tool_calls?: ChunkToolCall[] | null;
};

type ChunkToolCall = {
	index: number;
	id?: string | null;
	function?: { name?: string | null; arguments?: string | null } | null;
};

export class ChatCompletions extends Provider {
	override id: string;
	override name: string;
	readonly #url: string;
	readonly #headers: Record<string, string>;

	constructor(record: CustomProviderRecord) {
		super();
		this.id = record.id;
		this.name = record.name;
		this.#url = record.baseUrl;
		this.#headers = bearerHeaders(record.apiKey);
	}

	override async complete(
		model: string,
		messages: ProviderChatMessage[],
		options: ProviderChatOptions,
		onProgress: (progress: ProviderProgress) => void
	): Promise<ProviderReply> {
		const response = await send(`${this.#url}/chat/completions`, {
			method: 'POST',
			headers: this.#headers,
			signal: options.signal,
			body: JSON.stringify({
				model,
				reasoning_effort: requestedEffort(options),
				messages,
				tools: options.tools,
				parallel_tool_calls: options.tools ? true : undefined,
				temperature: options.temperature,
				max_tokens: options.maxTokens,
				stream: true
			})
		});
		const collector = new Collector(onProgress);
		let answered = false;

		for await (const chunk of serverSentEvents<Chunk>(response)) {
			if (chunk.error) throw remoteError(chunk.error.message);

			for (const choice of chunk.choices ?? []) {
				answered = true;
				applyDelta(choice.delta, collector);
			}
		}

		if (!answered) throw new Error('The model API returned no choices.');

		return collector.finish();
	}

	override models(): Promise<string[]> {
		return listModels(`${this.#url}/models`, this.#headers);
	}
}

function applyDelta(delta: ChunkDelta, collector: Collector): void {
	if (delta.reasoning_content) collector.thinking(delta.reasoning_content);
	if (delta.reasoning) collector.thinking(delta.reasoning);
	if (delta.content) collector.text(delta.content);

	for (const call of delta.tool_calls ?? []) {
		const name = call.function?.name;
		if (name) collector.toolCall(call.index, call.id || generateToolCallId(), name);

		const fragment = call.function?.arguments;
		if (fragment) collector.toolArguments(call.index, fragment);
	}
}
