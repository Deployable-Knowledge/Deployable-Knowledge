import { existsSync } from 'node:fs';

import type { ChatHistoryItem, ChatModelFunctions } from 'node-llama-cpp';

import { generateToolCallId } from '../endpoint';
import {
	Provider,
	type ProviderChatMessage,
	type ProviderChatOptions,
	type ProviderProgress,
	type ProviderReply
} from '../provider';
import { Collector } from '../stream';
import { listLocalModelFiles, resolveLocalModelPath, withChat } from './runtime';

export class LlamaCpp extends Provider {
	override id = 'llamacpp';
	override name = 'Local (llama.cpp)';

	override async complete(
		model: string,
		messages: ProviderChatMessage[],
		options: ProviderChatOptions,
		onProgress: (progress: ProviderProgress) => void
	): Promise<ProviderReply> {
		const modelPath = resolveLocalModelPath(model);

		if (!existsSync(modelPath)) {
			throw new Error(`Local model "${model}" is not downloaded.`);
		}

		const budget = options.reasoningBudget;
		const thoughtTokens = budget !== undefined && budget < 0 ? Infinity : budget;
		const functions =
			options.tools &&
			(Object.fromEntries(
				options.tools.map(({ function: fn }) => [
					fn.name,
					{ description: fn.description, params: fn.parameters }
				])
			) as ChatModelFunctions);
		const collector = new Collector(onProgress);

		const { functionCalls = [] } = await withChat(
			modelPath,
			options.gpuMode ?? 'auto',
			options.signal,
			(chat) =>
				chat.generateResponse(toChatHistory(messages), {
					functions,
					budgets: thoughtTokens === undefined ? undefined : { thoughtTokens },
					maxTokens:
						options.maxTokens === undefined
							? undefined
							: options.maxTokens + Math.max(0, budget ?? 0),
					temperature: options.temperature,
					topK: options.topK,
					signal: options.signal,
					onResponseChunk(chunk) {
						if (chunk.type === 'segment') collector.thinking(chunk.text);
						else if (chunk.type == null) collector.text(chunk.text);
					}
				})
		);

		functionCalls.forEach((call, index) => {
			collector.toolCall(index, generateToolCallId(), call.functionName);
			collector.toolArguments(index, JSON.stringify(call.params ?? {}));
		});

		return collector.finish();
	}

	override async models(): Promise<string[]> {
		return listLocalModelFiles();
	}
}

function toChatHistory(messages: ProviderChatMessage[]): ChatHistoryItem[] {
	const toolResults = new Map(
		messages
			.filter((message) => message.role === 'tool')
			.map((message) => [message.tool_call_id, message.content])
	);

	return messages.flatMap((message): ChatHistoryItem[] => {
		switch (message.role) {
			case 'system':
				return [{ type: 'system', text: message.content ?? '' }];
			case 'user':
				return [{ type: 'user', text: message.content ?? '' }];
			case 'assistant':
				return [
					{
						type: 'model',
						response: [
							...(message.content ? [message.content] : []),
							...(message.tool_calls ?? []).map((call, index) => ({
								type: 'functionCall' as const,
								name: call.function.name,
								params: JSON.parse(call.function.arguments) as unknown,
								result: toolResults.get(call.id) ?? '',
								startsNewChunk: index === 0
							}))
						]
					}
				];
			case 'tool':
				return [];
		}
	});
}
