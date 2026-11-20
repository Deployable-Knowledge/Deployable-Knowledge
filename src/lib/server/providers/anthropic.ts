import type { CustomProviderRecord } from '#lib/server/database/schema';
import { listModels, overflowError, remoteError, send } from './endpoint';
import {
	Provider,
	requestedEffort,
	type ProviderChatMessage,
	type ProviderChatOptions,
	type ProviderProgress,
	type ProviderReply,
	type ProviderToolCall
} from './provider';
import { Collector, serverSentEvents } from './stream';

const VERSION = '2026-10-21';
const MAX_TOKENS = 64_000;

type Role = 'user' | 'assistant';

type Block =
	| { type: 'text'; text: string }
	| { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
	| { type: 'tool_result'; tool_use_id: string; content: string };

type Turn = {
	role: Role;
	content: Block[];
};

type StartedBlock = { type: 'tool_use'; id: string; name: string } | { type: string };

type BlockDelta =
	| { type: 'text_delta'; text: string }
	| { type: 'thinking_delta'; thinking: string }
	| { type: 'input_json_delta'; partial_json: string };

type StreamEvent =
	| { type: 'content_block_start'; index: number; content_block: StartedBlock }
	| { type: 'content_block_delta'; index: number; delta: BlockDelta }
	| { type: 'message_delta'; delta: { stop_reason?: string | null } }
	| { type: 'message_stop' }
	| { type: 'error'; error: { message: string } };

export class Anthropic extends Provider {
	override id: string;
	override name: string;
	readonly #url: string;
	readonly #headers: Record<string, string>;

	constructor(record: CustomProviderRecord) {
		super();
		this.id = record.id;
		this.name = record.name;
		this.#url = record.baseUrl;
		this.#headers = {
			'Content-Type': 'application/json',
			'anthropic-version': VERSION,
			...(record.apiKey ? { 'x-api-key': record.apiKey } : {})
		};
	}

	override async complete(
		model: string,
		messages: ProviderChatMessage[],
		options: ProviderChatOptions,
		onProgress: (progress: ProviderProgress) => void
	): Promise<ProviderReply> {
		const effort = requestedEffort(options);
		const system = messages
			.filter((message) => message.role === 'system')
			.map((message) => message.content ?? '')
			.join('\n\n');
		const response = await send(`${this.#url}/v1/messages`, {
			method: 'POST',
			headers: this.#headers,
			signal: options.signal,
			body: JSON.stringify({
				model,
				max_tokens: MAX_TOKENS,
				thinking: effort ? { type: 'adaptive', display: 'summarized' } : undefined,
				output_config: effort ? { effort } : undefined,
				system: system || undefined,
				messages: toTurns(messages),
				tools: options.tools?.map(({ function: tool }) => ({
					name: tool.name,
					description: tool.description,
					input_schema: tool.parameters
				})),
				stream: true
			})
		});
		const collector = new Collector(onProgress);

		for await (const event of serverSentEvents<StreamEvent>(response)) {
			if (applyEvent(event, collector)) break;
		}

		return collector.finish();
	}

	override models(): Promise<string[]> {
		return listModels(`${this.#url}/v1/models?limit=1000`, this.#headers);
	}
}

function toTurns(messages: ProviderChatMessage[]): Turn[] {
	const turns: Turn[] = [];

	for (const message of messages) {
		const turn = toTurn(message);
		if (!turn) continue;

		const last = turns.at(-1);
		if (last?.role === turn.role) last.content.push(...turn.content);
		else turns.push(turn);
	}

	return turns;
}

function toTurn(message: ProviderChatMessage): Turn | null {
	const text: Block[] = message.content ? [{ type: 'text', text: message.content }] : [];

	switch (message.role) {
		case 'system':
			return null;
		case 'user':
			return text.length ? { role: 'user', content: text } : null;
		case 'assistant': {
			const content = [...text, ...(message.tool_calls ?? []).map(toToolUse)];
			return content.length ? { role: 'assistant', content } : null;
		}
		case 'tool':
			return {
				role: 'user',
				content: [
					{
						type: 'tool_result',
						tool_use_id: message.tool_call_id ?? '',
						content: message.content ?? ''
					}
				]
			};
	}
}

function toToolUse(call: ProviderToolCall): Block {
	return {
		type: 'tool_use',
		id: call.id,
		name: call.function.name,
		input: parseInput(call.function.arguments)
	};
}

function parseInput(value: string): Record<string, unknown> {
	try {
		const input: unknown = JSON.parse(value);
		const isObject = typeof input === 'object' && input !== null && !Array.isArray(input);
		return isObject ? (input as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function applyEvent(event: StreamEvent, collector: Collector): boolean {
	switch (event.type) {
		case 'content_block_start':
			startBlock(event.index, event.content_block, collector);
			return false;
		case 'content_block_delta':
			applyDelta(event.index, event.delta, collector);
			return false;
		case 'message_delta':
			if (event.delta.stop_reason === 'refusal') {
				throw new Error('The model declined to respond.');
			}
			if (event.delta.stop_reason === 'model_context_window_exceeded') throw overflowError();
			return false;
		case 'message_stop':
			return true;
		case 'error':
			throw remoteError(event.error.message);
		default:
			return false;
	}
}

function startBlock(index: number, block: StartedBlock, collector: Collector): void {
	if (block.type === 'text') collector.startText();
	if (block.type === 'thinking') collector.startThinking();
	if (block.type === 'tool_use' && 'id' in block) collector.toolCall(index, block.id, block.name);
}

function applyDelta(index: number, delta: BlockDelta, collector: Collector): void {
	if (delta.type === 'text_delta') collector.text(delta.text);
	if (delta.type === 'thinking_delta') collector.thinking(delta.thinking);
	if (delta.type === 'input_json_delta') collector.toolArguments(index, delta.partial_json);
}
