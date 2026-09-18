// Speech has no pages, so a whole transcript enters the chunk pipeline as a single text page.

import { decodeAudioFile } from '$lib/server/transcription/audio-decoder';
import {
	transcribeAudio,
	type TranscriptSegment
} from '$lib/server/transcription/transcription-model';
import { diarizeAudio } from '$lib/server/transcription/speaker-diarization';
import type { SpeakerTurn } from 'sherpa-onnx-node';
import type {
	ExtractionResult,
	ParsedChunk,
	Source,
	TranscriptTimelineEntry
} from './parse-shared';

function flattenSegmentText(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

export function buildTranscriptExtraction(
	source: Source,
	segments: TranscriptSegment[],
	fallbackText = ''
): ExtractionResult {
	const timeline: TranscriptTimelineEntry[] = [];
	let previousSpeaker: number | undefined;
	let content = '';

	for (const segment of segments) {
		const spoken = flattenSegmentText(segment.text);
		if (!spoken) continue;

		if (content) content += ' ';
		if (segment.speakerId !== undefined && segment.speakerId !== previousSpeaker) {
			content += `Speaker ${segment.speakerId + 1}: `;
		}
		previousSpeaker = segment.speakerId;
		const charStart = content.length;
		content += spoken;
		timeline.push({
			charStart,
			charEnd: content.length,
			startMs: segment.startMs,
			endMs: segment.endMs
		});
	}

	// Timestamp-less model output still transcribes; it just cannot be followed along during playback
	if (!content) content = flattenSegmentText(fallbackText);

	// Silent audio transcribes to nothing; ingestion reports the empty result to the user
	if (!content) return { chunks: [], pageCount: 0 };

	return {
		chunks: [{ chunkType: 'TEXT', source, pageIndex: 0, content, timeline }],
		pageCount: 1
	};
}

function assignSpeakers(words: TranscriptSegment[], turns: SpeakerTurn[]): TranscriptSegment[] {
	return words.map((word) => {
		let speakerId: number | undefined;
		let longestOverlapMs = 0;

		for (const turn of turns) {
			const overlapMs =
				Math.min(word.endMs, turn.end * 1000) - Math.max(word.startMs, turn.start * 1000);

			if (overlapMs > longestOverlapMs) {
				longestOverlapMs = overlapMs;
				speakerId = turn.speaker;
			}
		}

		return speakerId === undefined ? word : { ...word, speakerId };
	});
}

export async function extractTranscript(
	source: Source,
	onProgress?: (ratio: number, message: string) => void
): Promise<ExtractionResult> {
	const audioData = await decodeAudioFile(source.path);

	onProgress?.(0.25, 'Transcribing speech');
	const transcription = await transcribeAudio(audioData);

	let segments = transcription.segments;
	if (segments.length > 0) {
		onProgress?.(0.65, 'Identifying speakers');
		try {
			const turns = await diarizeAudio(audioData);
			segments = assignSpeakers(segments, turns);
		} catch (error) {
			console.warn('[Transcription] Speaker diarization unavailable:', error);
		}
	}

	return buildTranscriptExtraction(source, segments, transcription.text);
}

function timeAtChar(timeline: TranscriptTimelineEntry[], charIndex: number): number {
	for (const entry of timeline) {
		if (charIndex <= entry.charStart) return entry.startMs;

		if (charIndex < entry.charEnd) {
			const span = entry.charEnd - entry.charStart;
			const ratio = span > 0 ? (charIndex - entry.charStart) / span : 0;
			return Math.round(entry.startMs + (entry.endMs - entry.startMs) * ratio);
		}
	}

	return timeline[timeline.length - 1].endMs;
}

export function attachTranscriptTimings(
	chunks: ParsedChunk[],
	timeline: TranscriptTimelineEntry[] = []
): ParsedChunk[] {
	if (timeline.length === 0) return chunks;

	return chunks.map((chunk) => {
		const { startChar, endChar } = chunk;
		if (startChar === undefined || endChar === undefined) return chunk;

		const startMs = timeAtChar(timeline, startChar);
		return {
			...chunk,
			startMs,
			endMs: Math.max(startMs, timeAtChar(timeline, endChar))
		};
	});
}
