import { AutoModelForCTC, Wav2Vec2Processor } from '@huggingface/transformers';
import { AUDIO_SAMPLE_RATE, sampleIndexToMs } from './audio-types';
import type {
	TranscriptSegment,
	TranscribedAudioChunk,
	TranscriptionResult
} from './transcription-model';
import { TRANSFORMERS_CACHE_DIR } from '../utils/transformers-env';

const ALIGNMENT_MODEL = 'Xenova/wav2vec2-base-960h';

interface AlignmentToken {
	tokenId: number | null;
	wordIndex?: number;
}

async function loadAlignmentAssets() {
	const [processor, model] = await Promise.all([
		Wav2Vec2Processor.from_pretrained(ALIGNMENT_MODEL, { cache_dir: TRANSFORMERS_CACHE_DIR }),
		AutoModelForCTC.from_pretrained(ALIGNMENT_MODEL, { cache_dir: TRANSFORMERS_CACHE_DIR })
	]);

	const tokenizer = processor.tokenizer;
	if (!tokenizer) throw new Error(`${ALIGNMENT_MODEL} did not provide a tokenizer.`);

	const vocabulary = tokenizer.get_vocab();
	const blankTokenId = vocabulary.get('<pad>') ?? tokenizer.pad_token_id;
	if (!Number.isInteger(blankTokenId)) {
		throw new Error(`${ALIGNMENT_MODEL} did not provide a CTC blank token.`);
	}

	return { processor, model, vocabulary, blankTokenId: blankTokenId as number };
}

type AlignmentAssets = Awaited<ReturnType<typeof loadAlignmentAssets>>;

let alignmentAssets: Promise<AlignmentAssets> | undefined;

function getAlignmentAssets(): Promise<AlignmentAssets> {
	alignmentAssets ??= loadAlignmentAssets().catch((error: unknown) => {
		alignmentAssets = undefined;
		throw error;
	});
	return alignmentAssets;
}

function createAlignmentTarget(
	words: TranscriptSegment[],
	vocabulary: Map<string, number>
): AlignmentToken[] {
	const delimiterTokenId = vocabulary.get('|');
	const target: AlignmentToken[] = [];

	words.forEach((word, wordIndex) => {
		const tokens: AlignmentToken[] = [];
		const normalized = word.text
			.replace(/[’‘]/g, "'")
			.normalize('NFKD')
			.replace(/\p{Mark}/gu, '');

		for (const character of normalized) {
			const tokenId = vocabulary.get(character) ?? vocabulary.get(character.toUpperCase());
			if (tokenId !== undefined) tokens.push({ tokenId, wordIndex });
			else if (/[\p{Letter}\p{Number}]/u.test(character)) tokens.push({ tokenId: null, wordIndex });
		}

		if (tokens.length === 0) return;
		if (target.length > 0 && delimiterTokenId !== undefined) {
			target.push({ tokenId: delimiterTokenId });
		}
		target.push(...tokens);
	});

	return target;
}

function alignWordFrames(
	logits: Float32Array,
	frameCount: number,
	vocabularySize: number,
	blankTokenId: number,
	target: AlignmentToken[],
	wordCount: number
): Array<[start: number, end: number] | undefined> | null {
	const normalizers = new Float64Array(frameCount);
	const blankScores = new Float64Array(frameCount);
	const wildcardScores = new Float64Array(frameCount);

	for (let frame = 0; frame < frameCount; frame++) {
		const row = logits.subarray(frame * vocabularySize, (frame + 1) * vocabularySize);
		let maximum = -Infinity;
		let maximumNonBlank = -Infinity;
		row.forEach((value, tokenId) => {
			maximum = Math.max(maximum, value);
			if (tokenId !== blankTokenId) maximumNonBlank = Math.max(maximumNonBlank, value);
		});

		let exponentialSum = 0;
		for (const value of row) exponentialSum += Math.exp(value - maximum);

		normalizers[frame] = maximum + Math.log(exponentialSum);
		blankScores[frame] = row[blankTokenId] - normalizers[frame];
		wildcardScores[frame] = maximumNonBlank - normalizers[frame];
	}

	const tokenScore = (frame: number, { tokenId }: AlignmentToken) =>
		tokenId === null
			? wildcardScores[frame]
			: logits[frame * vocabularySize + tokenId] - normalizers[frame];

	const columns = target.length + 1;
	const trellis = new Float64Array((frameCount + 1) * columns).fill(-Infinity);
	trellis[0] = 0;

	for (let frame = 0; frame < frameCount; frame++) {
		const row = frame * columns;
		const next = row + columns;
		trellis[next] = trellis[row] + blankScores[frame];

		for (let token = 0; token < Math.min(target.length, frame + 1); token++) {
			const stayed = trellis[row + token + 1] + blankScores[frame];
			const advanced = trellis[row + token] + tokenScore(frame, target[token]);
			trellis[next + token + 1] = Math.max(stayed, advanced);
		}
	}

	let time = -1;
	let bestScore = -Infinity;
	for (let candidate = target.length; candidate <= frameCount; candidate++) {
		const score = trellis[candidate * columns + target.length];
		if (score > bestScore) {
			bestScore = score;
			time = candidate;
		}
	}
	if (time < 0 || !Number.isFinite(bestScore)) return null;

	const spans: Array<[start: number, end: number] | undefined> = new Array(wordCount);
	let column = target.length;

	while (time > 0 && column > 0) {
		const frame = time - 1;
		const token = target[column - 1];

		if (token.wordIndex !== undefined) {
			const span = spans[token.wordIndex];
			spans[token.wordIndex] = span
				? [Math.min(span[0], frame), Math.max(span[1], frame + 1)]
				: [frame, frame + 1];
		}

		const stayed = trellis[frame * columns + column] + blankScores[frame];
		const advanced = trellis[frame * columns + column - 1] + tokenScore(frame, token);
		if (advanced > stayed) column--;
		time--;
	}

	return column === 0 ? spans : null;
}

async function alignChunk(
	chunk: TranscribedAudioChunk,
	assets: AlignmentAssets
): Promise<TranscriptSegment[]> {
	if (chunk.segments.length === 0 || chunk.audio.samples.length === 0) return chunk.segments;

	const target = createAlignmentTarget(chunk.segments, assets.vocabulary);
	if (target.length === 0) return chunk.segments;

	const { logits } = (await assets.model(await assets.processor(chunk.audio.samples))) as {
		logits: { data: Float32Array; dims: number[] };
	};
	const [batch, frameCount, vocabularySize] = logits.dims;

	if (
		logits.dims.length !== 3 ||
		batch !== 1 ||
		frameCount <= 0 ||
		vocabularySize <= assets.blankTokenId ||
		logits.data.length !== frameCount * vocabularySize
	) {
		throw new Error(`Unexpected CTC logits shape: ${logits.dims.join('x')}`);
	}
	if (target.length > frameCount) return chunk.segments;

	const spans = alignWordFrames(
		logits.data,
		frameCount,
		vocabularySize,
		assets.blankTokenId,
		target,
		chunk.segments.length
	);
	if (!spans) return chunk.segments;

	const sourceStartMs = sampleIndexToMs(chunk.audio.startSample);
	const sourceEndMs = sampleIndexToMs(chunk.audio.endSample);
	const frameDurationMs = ((chunk.audio.samples.length / AUDIO_SAMPLE_RATE) * 1000) / frameCount;
	const toMs = (frame: number) => Math.round(sourceStartMs + frame * frameDurationMs);

	return chunk.segments.map((word, wordIndex) => {
		const span = spans[wordIndex];
		if (!span) return word;

		const startMs = Math.min(sourceEndMs, Math.max(sourceStartMs, toMs(span[0])));
		const endMs = Math.min(sourceEndMs, Math.max(startMs, toMs(span[1])));
		return { ...word, startMs, endMs };
	});
}

export async function alignTranscription(
	transcription: TranscriptionResult,
	onChunk?: (completed: number, total: number) => void
): Promise<TranscriptionResult> {
	if (transcription.chunks.length === 0) return transcription;

	let assets: AlignmentAssets;
	try {
		assets = await getAlignmentAssets();
	} catch (error) {
		console.warn('[Transcription] Forced-alignment model unavailable:', error);
		return transcription;
	}

	const alignedChunks: TranscribedAudioChunk[] = [];
	for (const [index, chunk] of transcription.chunks.entries()) {
		try {
			alignedChunks.push({ ...chunk, segments: await alignChunk(chunk, assets) });
		} catch (error) {
			console.warn('[Transcription] Could not align an audio chunk:', error);
			alignedChunks.push(chunk);
		}
		onChunk?.(index + 1, transcription.chunks.length);
	}

	return {
		text: transcription.text,
		segments: alignedChunks.flatMap((chunk) => chunk.segments),
		chunks: alignedChunks
	};
}
