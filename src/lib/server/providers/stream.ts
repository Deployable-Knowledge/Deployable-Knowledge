import type { ProviderProgress, ProviderReply, ProviderToolCall } from './provider';

const DONE = '[DONE]';

export async function* serverSentEvents<T>(response: Response): AsyncGenerator<T> {
	if (!response.body) return;

	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = '';

	try {
		for (;;) {
			const end = buffer.indexOf('\n\n');

			if (end < 0) {
				const { done, value } = await reader.read();
				if (done) return;
				buffer += value.replaceAll('\r', '');
				continue;
			}

			const data = eventData(buffer.slice(0, end));
			buffer = buffer.slice(end + 2);

			if (data === null) continue;
			if (data === DONE) return;
			yield parseEvent<T>(data);
		}
	} finally {
		await reader.cancel();
	}
}

function eventData(block: string): string | null {
	const lines = block
		.split('\n')
		.filter((line) => line.startsWith('data:'))
		.map((line) => (line[5] === ' ' ? line.slice(6) : line.slice(5)));

	return lines.length ? lines.join('\n') : null;
}

function parseEvent<T>(data: string): T {
	try {
		return JSON.parse(data) as T;
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		throw new Error(`The model API streamed a malformed event: ${reason}`, { cause });
	}
}

class Part {
	content = '';
	split = false;

	push(delta: string): string | null {
		if (!delta) return null;

		const pushed = this.split && this.content ? `\n\n${delta}` : delta;
		this.split = false;
		this.content += pushed;
		return pushed;
	}

	finish(): string | null {
		return this.content.trim() ? this.content : null;
	}
}

export class Collector {
	readonly #onProgress: (progress: ProviderProgress) => void;
	readonly #text = new Part();
	readonly #thinking = new Part();
	readonly #toolCalls = new Map<number, ProviderToolCall>();

	constructor(onProgress: (progress: ProviderProgress) => void) {
		this.#onProgress = onProgress;
	}

	startText(): void {
		this.#text.split = true;
	}

	startThinking(): void {
		this.#thinking.split = true;
	}

	text(delta: string): void {
		const text = this.#text.push(delta);
		if (text !== null) this.#onProgress({ kind: 'text', text });
	}

	thinking(delta: string): void {
		const text = this.#thinking.push(delta);
		if (text !== null) this.#onProgress({ kind: 'thinking', text });
	}

	toolCall(key: number, id: string, name: string): void {
		if (this.#toolCalls.has(key)) return;
		this.#toolCalls.set(key, { id, type: 'function', function: { name, arguments: '' } });
	}

	toolArguments(key: number, delta: string): void {
		const call = this.#toolCalls.get(key);
		if (call) call.function.arguments += delta;
	}

	finish(): ProviderReply {
		const toolCalls = [...this.#toolCalls].sort(([left], [right]) => left - right);

		return {
			content: this.#text.finish(),
			thinking: this.#thinking.finish(),
			toolCalls: toolCalls.map(([, call]) => call)
		};
	}
}
