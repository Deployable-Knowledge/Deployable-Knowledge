import { gzipSync } from 'node:zlib';
import { AUDIO_SAMPLE_RATE, sampleIndexToMs } from './audio-types';
import type { TranscribedAudioChunk, TranscriptionResult } from './transcription-model';

const MINIMUM_ANALYSIS_WORDS = 12;
const MAXIMUM_CONSECUTIVE_WORD_RUN = 8;
const MAXIMUM_TRIGRAM_COVERAGE = 0.45;
const MAXIMUM_WORDS_PER_SECOND = 5.5;
const SUSPICIOUS_COMPRESSION_RATIO = 2.4;

export interface HallucinationAssessment {
	reasons: string[];
	rejected: boolean;
}

function normalizedWords(text: string): string[] {
	return text.toLowerCase().match(/[\p{Letter}\p{Number}']+/gu) ?? [];
}

function longestConsecutiveWordRun(words: string[]): number {
	let longest = 0;
	let current = 0;
	let previous = '';

	for (const word of words) {
		if (word === previous) {
			current += 1;
		} else {
			previous = word;
			current = 1;
		}

		longest = Math.max(longest, current);
	}

	return longest;
}

function repeatedNgramCoverage(words: string[], size: number): number {
	if (words.length < size) return 0;

	const counts = new Map<string, number>();
	let greatestCount = 0;

	for (let index = 0; index <= words.length - size; index += 1) {
		const key = words.slice(index, index + size).join('\u0000');
		const count = (counts.get(key) ?? 0) + 1;
		counts.set(key, count);
		greatestCount = Math.max(greatestCount, count);
	}

	return Math.min(1, (greatestCount * size) / words.length);
}

function compressionRatio(text: string): number {
	const byteLength = Buffer.byteLength(text, 'utf8');
	if (byteLength < 100) return 0;

	const compressedLength = gzipSync(text).byteLength;
	return compressedLength === 0 ? 0 : byteLength / compressedLength;
}

export function assessHallucination(chunk: TranscribedAudioChunk): HallucinationAssessment {
	const text = chunk.text.trim();
	const words = normalizedWords(text);

	if (words.length < MINIMUM_ANALYSIS_WORDS) {
		return {
			reasons: [],
			rejected: false
		};
	}

	const durationSeconds = Math.max(chunk.audio.samples.length / AUDIO_SAMPLE_RATE, Number.EPSILON);

	const consecutiveWordRun = longestConsecutiveWordRun(words);
	const trigramCoverage = repeatedNgramCoverage(words, 3);
	const wordsPerSecond = words.length / durationSeconds;
	const textCompressionRatio = compressionRatio(text);
	const reasons: string[] = [];

	if (consecutiveWordRun >= MAXIMUM_CONSECUTIVE_WORD_RUN) {
		reasons.push(`${consecutiveWordRun} consecutive copies of one word`);
	}

	if (words.length >= 24 && trigramCoverage >= MAXIMUM_TRIGRAM_COVERAGE) {
		reasons.push(`${Math.round(trigramCoverage * 100)}% repeated-trigram coverage`);
	}

	if (
		words.length >= 30 &&
		wordsPerSecond >= MAXIMUM_WORDS_PER_SECOND &&
		textCompressionRatio >= SUSPICIOUS_COMPRESSION_RATIO
	) {
		reasons.push(
			`${wordsPerSecond.toFixed(1)} words/second with compression ratio ${textCompressionRatio.toFixed(2)}`
		);
	}

	return {
		reasons,
		rejected: reasons.length > 0
	};
}

export function filterHallucinatedTranscription(
	transcription: TranscriptionResult
): TranscriptionResult {
	const acceptedChunks: TranscribedAudioChunk[] = [];

	for (const [index, chunk] of transcription.chunks.entries()) {
		const assessment = assessHallucination(chunk);

		if (!assessment.rejected) {
			acceptedChunks.push(chunk);
			continue;
		}

		console.warn('[Transcription] Rejected probable hallucination:', {
			chunk: index + 1,
			endMs: sampleIndexToMs(chunk.audio.endSample),
			reasons: assessment.reasons,
			startMs: sampleIndexToMs(chunk.audio.startSample)
		});
	}

	return {
		chunks: acceptedChunks,
		segments: acceptedChunks.flatMap((chunk) => chunk.segments),
		text: acceptedChunks
			.map((chunk) => chunk.text)
			.filter(Boolean)
			.join(' ')
			.trim()
	};
}
