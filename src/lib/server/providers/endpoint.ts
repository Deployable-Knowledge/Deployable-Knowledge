import { randomUUID } from 'node:crypto';

const MODEL_LIST_TIMEOUT_MS = 10_000;

const OVERFLOW_MARKERS = [
	'context_length_exceeded',
	'context window',
	'context length',
	'prompt is too long',
	'input is too long',
	'too many tokens'
];

type ModelList = {
	data: { id: string }[];
};

export function overflowError(): Error {
	return new Error("The conversation no longer fits in the model's context window.");
}

export function remoteError(message: string): Error {
	return overflows(message)
		? overflowError()
		: new Error(`The model API reported an error: ${message}`);
}

function overflows(message: string): boolean {
	const lowered = message.toLowerCase();
	return OVERFLOW_MARKERS.some((marker) => lowered.includes(marker));
}

export async function send(url: string, init: RequestInit): Promise<Response> {
	let response: Response;

	try {
		response = await fetch(url, init);
	} catch (cause) {
		if (init.signal?.aborted || !(cause instanceof Error)) throw cause;
		const reason = cause.cause instanceof Error ? cause.cause.message : cause.message;
		throw new Error(`Could not reach the model API: ${reason}`, { cause });
	}

	if (response.ok) return response;

	const body = await response.text();
	throw overflows(body)
		? overflowError()
		: new Error(`The model API returned ${response.status}: ${body}`);
}

export async function listModels(url: string, headers: Record<string, string>): Promise<string[]> {
	const response = await send(url, {
		headers,
		signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS)
	});
	const { data } = (await response.json()) as ModelList;

	return data.map((model) => model.id).sort((left, right) => left.localeCompare(right));
}

export function bearerHeaders(key: string): Record<string, string> {
	return {
		'Content-Type': 'application/json',
		...(key ? { Authorization: `Bearer ${key}` } : {})
	};
}

export function generateToolCallId(): string {
	return `call_${randomUUID()}`;
}
