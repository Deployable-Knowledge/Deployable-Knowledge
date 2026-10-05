import { AutoModelForCTC, Wav2Vec2Processor } from '@huggingface/transformers';
import { AUDIO_SAMPLE_RATE, sampleIndexToMs } from './audio-types';
import type {
	TranscriptSegment,
	TranscribedAudioChunk,
	TranscriptionResult
} from './transcription-model';
import { TRANSFORMERS_CACHE_DIR } from '../utils/transformers-env';

const ALIGNMENT_MODEL = 'Xenova/wav2vec2-base-960h';

interface CtcOutput {
	logits: {
		data: Float32Array;
		dims: number[];
	};
}

interface AlignmentToken {
	/**
	 * null represents an unsupported spoken character. It is aligned against
	 * the strongest non-blank CTC emission for that frame.
	 */
	tokenId: number | null;

	/**
	 * Undefined for a word-delimiter token.
	 */
	wordIndex?: number;
}

interface AlignmentPathPoint {
	tokenIndex: number;
	timeIndex: number;
}

interface WordFrameSpan {
	startFrame: number;
	endFrame: number;
}

interface LogProbabilityView {
	logits: Float32Array;
	frameCount: number;
	vocabularySize: number;
	normalizers: Float64Array;
	blankScores: Float64Array;
	wildcardScores: Float64Array;
}

async function loadAlignmentAssets() {
	/*
	 * AutoProcessor only reads preprocessor_config.json, which for this model names a feature
	 * extractor but no processor class, so it would load no tokenizer. Wav2Vec2Processor loads
	 * both the feature extractor and the CTC tokenizer whose vocabulary the alignment needs.
	 */
	const [processor, model] = await Promise.all([
		Wav2Vec2Processor.from_pretrained(ALIGNMENT_MODEL, {
			cache_dir: TRANSFORMERS_CACHE_DIR
		}),
		AutoModelForCTC.from_pretrained(ALIGNMENT_MODEL, {
			cache_dir: TRANSFORMERS_CACHE_DIR
		})
	]);

	const tokenizer = processor.tokenizer;
	if (!tokenizer) {
		throw new Error(`${ALIGNMENT_MODEL} did not provide a tokenizer.`);
	}

	const vocabulary = tokenizer.get_vocab();

	let blankTokenId = vocabulary.get('<pad>');
	if (blankTokenId === undefined) {
		blankTokenId = vocabulary.get('[pad]');
	}
	if (blankTokenId === undefined) {
		blankTokenId = tokenizer.pad_token_id;
	}
	if (!Number.isInteger(blankTokenId)) {
		throw new Error(`${ALIGNMENT_MODEL} did not provide a CTC blank token.`);
	}

	return {
		processor,
		model,
		vocabulary,
		blankTokenId
	};
}

type AlignmentAssets = Awaited<ReturnType<typeof loadAlignmentAssets>>;

let alignmentAssetsPromise: Promise<AlignmentAssets> | undefined;

function getAlignmentAssets(): Promise<AlignmentAssets> {
	if (alignmentAssetsPromise) return alignmentAssetsPromise;

	const promise = loadAlignmentAssets();
	alignmentAssetsPromise = promise;

	void promise.catch(() => {
		if (alignmentAssetsPromise === promise) {
			alignmentAssetsPromise = undefined;
		}
	});

	return promise;
}

function findTokenId(vocabulary: Map<string, number>, character: string): number | undefined {
	const direct = vocabulary.get(character);
	if (direct !== undefined) return direct;

	const upper = vocabulary.get(character.toUpperCase());
	if (upper !== undefined) return upper;

	return vocabulary.get(character.toLowerCase());
}

function normalizeCharacter(character: string): string[] {
	let normalized = character;

	if (normalized === '’' || normalized === '‘') {
		normalized = "'";
	}

	normalized = normalized.normalize('NFKD').replace(/\p{Mark}/gu, '');

	return Array.from(normalized);
}

function createAlignmentTarget(
	words: TranscriptSegment[],
	vocabulary: Map<string, number>
): AlignmentToken[] {
	const delimiterTokenId = findTokenId(vocabulary, '|');

	const tokensByWord = words.map<AlignmentToken[]>((word, wordIndex) => {
		const tokens: AlignmentToken[] = [];

		for (const originalCharacter of Array.from(word.text)) {
			for (const character of normalizeCharacter(originalCharacter)) {
				const tokenId = findTokenId(vocabulary, character);

				if (tokenId !== undefined) {
					tokens.push({
						tokenId,
						wordIndex
					});
					continue;
				}

				/*
				 * Punctuation unsupported by the CTC vocabulary is silent
				 * and can be skipped. Letters and numbers may represent
				 * audible content, so keep them as wildcard emissions.
				 */
				if (/[\p{Letter}\p{Number}]/u.test(character)) {
					tokens.push({
						tokenId: null,
						wordIndex
					});
				}
			}
		}

		return tokens;
	});

	const target: AlignmentToken[] = [];

	for (const wordTokens of tokensByWord) {
		if (wordTokens.length === 0) continue;

		if (target.length > 0 && delimiterTokenId !== undefined) {
			target.push({
				tokenId: delimiterTokenId
			});
		}

		target.push(...wordTokens);
	}

	return target;
}

function createLogProbabilityView(
	logits: Float32Array,
	frameCount: number,
	vocabularySize: number,
	blankTokenId: number
): LogProbabilityView {
	if (blankTokenId < 0 || blankTokenId >= vocabularySize) {
		throw new Error('CTC blank token is outside the vocabulary.');
	}

	const normalizers = new Float64Array(frameCount);
	const blankScores = new Float64Array(frameCount);
	const wildcardScores = new Float64Array(frameCount);

	for (let frame = 0; frame < frameCount; frame += 1) {
		const frameOffset = frame * vocabularySize;
		let maximum = Number.NEGATIVE_INFINITY;
		let maximumNonBlank = Number.NEGATIVE_INFINITY;

		for (let tokenId = 0; tokenId < vocabularySize; tokenId += 1) {
			const value = logits[frameOffset + tokenId];
			if (value > maximum) maximum = value;

			if (tokenId !== blankTokenId && value > maximumNonBlank) {
				maximumNonBlank = value;
			}
		}

		let exponentialSum = 0;

		for (let tokenId = 0; tokenId < vocabularySize; tokenId += 1) {
			exponentialSum += Math.exp(logits[frameOffset + tokenId] - maximum);
		}

		const normalizer = maximum + Math.log(exponentialSum);

		normalizers[frame] = normalizer;
		blankScores[frame] = logits[frameOffset + blankTokenId] - normalizer;
		wildcardScores[frame] = maximumNonBlank - normalizer;
	}

	return {
		logits,
		frameCount,
		vocabularySize,
		normalizers,
		blankScores,
		wildcardScores
	};
}

function tokenScore(
	probabilities: LogProbabilityView,
	frame: number,
	token: AlignmentToken
): number {
	if (token.tokenId === null) {
		return probabilities.wildcardScores[frame];
	}

	return (
		probabilities.logits[frame * probabilities.vocabularySize + token.tokenId] -
		probabilities.normalizers[frame]
	);
}

function buildTrellis(probabilities: LogProbabilityView, target: AlignmentToken[]): Float64Array {
	const columnCount = target.length + 1;
	const rowCount = probabilities.frameCount + 1;
	const trellis = new Float64Array(rowCount * columnCount);

	trellis.fill(Number.NEGATIVE_INFINITY);
	trellis[0] = 0;

	for (let frame = 0; frame < probabilities.frameCount; frame += 1) {
		const currentRow = frame * columnCount;
		const nextRow = (frame + 1) * columnCount;

		trellis[nextRow] = trellis[currentRow] + probabilities.blankScores[frame];

		const reachableTokens = Math.min(target.length, frame + 1);

		for (let tokenIndex = 0; tokenIndex < reachableTokens; tokenIndex += 1) {
			const column = tokenIndex + 1;

			const stayed = trellis[currentRow + column] + probabilities.blankScores[frame];

			const advanced =
				trellis[currentRow + column - 1] + tokenScore(probabilities, frame, target[tokenIndex]);

			trellis[nextRow + column] = Math.max(stayed, advanced);
		}
	}

	return trellis;
}

function backtrack(
	trellis: Float64Array,
	probabilities: LogProbabilityView,
	target: AlignmentToken[]
): AlignmentPathPoint[] | null {
	const columnCount = target.length + 1;
	const finalColumn = target.length;

	let bestTime = -1;
	let bestScore = Number.NEGATIVE_INFINITY;

	for (let time = target.length; time <= probabilities.frameCount; time += 1) {
		const score = trellis[time * columnCount + finalColumn];

		if (score > bestScore) {
			bestScore = score;
			bestTime = time;
		}
	}

	if (bestTime < 0 || !Number.isFinite(bestScore)) {
		return null;
	}

	const path: AlignmentPathPoint[] = [];
	let time = bestTime;
	let column = finalColumn;

	while (time > 0 && column > 0) {
		const frame = time - 1;
		const currentTokenIndex = column - 1;

		const stayed = trellis[frame * columnCount + column] + probabilities.blankScores[frame];

		const advanced =
			trellis[frame * columnCount + column - 1] +
			tokenScore(probabilities, frame, target[currentTokenIndex]);

		path.push({
			tokenIndex: currentTokenIndex,
			timeIndex: frame
		});

		if (advanced > stayed) {
			column -= 1;
		}

		time -= 1;
	}

	if (column !== 0) return null;

	path.reverse();
	return path;
}

function collectWordSpans(
	path: AlignmentPathPoint[],
	target: AlignmentToken[],
	wordCount: number
): Array<WordFrameSpan | undefined> {
	const spans: Array<WordFrameSpan | undefined> = new Array(wordCount);

	for (const point of path) {
		const wordIndex = target[point.tokenIndex].wordIndex;

		if (wordIndex === undefined) continue;

		const existing = spans[wordIndex];

		if (!existing) {
			spans[wordIndex] = {
				startFrame: point.timeIndex,
				endFrame: point.timeIndex + 1
			};
			continue;
		}

		existing.startFrame = Math.min(existing.startFrame, point.timeIndex);
		existing.endFrame = Math.max(existing.endFrame, point.timeIndex + 1);
	}

	return spans;
}

async function alignChunk(
	chunk: TranscribedAudioChunk,
	assets: AlignmentAssets
): Promise<TranscriptSegment[]> {
	if (chunk.segments.length === 0 || chunk.audio.samples.length === 0) {
		return chunk.segments;
	}

	const target = createAlignmentTarget(chunk.segments, assets.vocabulary);

	if (target.length === 0) return chunk.segments;

	const inputs = await assets.processor(chunk.audio.samples);

	const output = (await assets.model(inputs)) as CtcOutput;
	const { data: logits, dims } = output.logits;

	if (dims.length !== 3 || dims[0] !== 1 || dims[1] <= 0 || dims[2] <= 0) {
		throw new Error(`Unexpected CTC logits shape: ${dims.join('x')}`);
	}

	const frameCount = dims[1];
	const vocabularySize = dims[2];

	if (target.length > frameCount) {
		return chunk.segments;
	}

	const expectedValueCount = frameCount * vocabularySize;

	if (logits.length !== expectedValueCount) {
		throw new Error('CTC logits data does not match its declared dimensions.');
	}

	const probabilities = createLogProbabilityView(
		logits,
		frameCount,
		vocabularySize,
		assets.blankTokenId
	);

	const trellis = buildTrellis(probabilities, target);

	const path = backtrack(trellis, probabilities, target);

	if (!path) return chunk.segments;

	const spans = collectWordSpans(path, target, chunk.segments.length);

	const sourceStartMs = sampleIndexToMs(chunk.audio.startSample);
	const sourceEndMs = sampleIndexToMs(chunk.audio.endSample);
	const chunkDurationMs = (chunk.audio.samples.length / AUDIO_SAMPLE_RATE) * 1000;
	const frameDurationMs = chunkDurationMs / frameCount;

	return chunk.segments.map((word, wordIndex) => {
		const span = spans[wordIndex];
		if (!span) return word;

		const startMs = Math.min(
			sourceEndMs,
			Math.max(sourceStartMs, Math.round(sourceStartMs + span.startFrame * frameDurationMs))
		);

		const endMs = Math.min(
			sourceEndMs,
			Math.max(startMs, Math.round(sourceStartMs + span.endFrame * frameDurationMs))
		);

		return {
			...word,
			startMs,
			endMs
		};
	});
}

export async function alignTranscription(
	transcription: TranscriptionResult,
	onChunk?: (completed: number, total: number) => void
): Promise<TranscriptionResult> {
	if (transcription.chunks.length === 0) {
		return transcription;
	}

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
			alignedChunks.push({
				...chunk,
				segments: await alignChunk(chunk, assets)
			});
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
