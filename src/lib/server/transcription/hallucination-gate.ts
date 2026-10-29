import { gzipSync } from 'node:zlib';
import { createLogger } from '#lib/server/logging';
import { AUDIO_SAMPLE_RATE, sampleIndexToMs } from './audio-types';
import {
	combineChunkResults,
	type TranscribedAudioChunk,
	type TranscriptionResult
} from './transcription-model';

const log = createLogger('documents');

const MINIMUM_ANALYSIS_WORDS = 12;
const MAXIMUM_CONSECUTIVE_WORD_RUN = 8;
const MAXIMUM_TRIGRAM_COVERAGE = 0.45;
const MAXIMUM_WORDS_PER_SECOND = 5.5;
const SUSPICIOUS_COMPRESSION_RATIO = 2.4;

function longestConsecutiveWordRun(words: string[]): number {
	let longest = 0;
	let current = 0;
	words.forEach((word, index) => {
		current = word === words[index - 1] ? current + 1 : 1;
		longest = Math.max(longest, current);
	});
	return longest;
}

function trigramCoverage(words: string[]): number {
	const counts = new Map<string, number>();
	let greatestCount = 0;
	for (let index = 0; index + 3 <= words.length; index++) {
		const key = words.slice(index, index + 3).join('\u0000');
		const count = (counts.get(key) ?? 0) + 1;
		counts.set(key, count);
		greatestCount = Math.max(greatestCount, count);
	}
	return Math.min(1, (greatestCount * 3) / words.length);
}

function compressionRatio(text: string): number {
	const byteLength = Buffer.byteLength(text, 'utf8');
	if (byteLength < 100) return 0;
	return byteLength / gzipSync(text).byteLength;
}

function hallucinationReasons(chunk: TranscribedAudioChunk): string[] {
	const text = chunk.text.trim();
	const words = text.toLowerCase().match(/[\p{Letter}\p{Number}']+/gu) ?? [];
	if (words.length < MINIMUM_ANALYSIS_WORDS) return [];

	const reasons: string[] = [];
	const run = longestConsecutiveWordRun(words);
	if (run >= MAXIMUM_CONSECUTIVE_WORD_RUN) reasons.push(`${run} consecutive copies of one word`);

	const coverage = trigramCoverage(words);
	if (words.length >= 24 && coverage >= MAXIMUM_TRIGRAM_COVERAGE) {
		reasons.push(`${Math.round(coverage * 100)}% repeated-trigram coverage`);
	}

	const seconds = Math.max(chunk.audio.samples.length / AUDIO_SAMPLE_RATE, Number.EPSILON);
	const wordsPerSecond = words.length / seconds;
	const ratio = compressionRatio(text);
	if (
		words.length >= 30 &&
		wordsPerSecond >= MAXIMUM_WORDS_PER_SECOND &&
		ratio >= SUSPICIOUS_COMPRESSION_RATIO
	) {
		reasons.push(
			`${wordsPerSecond.toFixed(1)} words/second with compression ratio ${ratio.toFixed(2)}`
		);
	}

	return reasons;
}

export function filterHallucinatedTranscription(
	transcription: TranscriptionResult
): TranscriptionResult {
	const accepted = transcription.chunks.filter((chunk, index) => {
		const reasons = hallucinationReasons(chunk);
		if (reasons.length === 0) return true;

		log.warn('Rejected probable hallucination', {
			chunk: index + 1,
			endMs: sampleIndexToMs(chunk.audio.endSample),
			reasons: reasons.join(', '),
			startMs: sampleIndexToMs(chunk.audio.startSample)
		});
		return false;
	});

	return combineChunkResults(accepted);
}
