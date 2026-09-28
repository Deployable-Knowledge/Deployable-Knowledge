// Speech has no pages, so a whole transcript enters the chunk pipeline as a single text page.

import { decodeAudioFile } from '$lib/server/transcription/audio-decoder';
import {
	transcribeAudioChunks,
	type TranscriptSegment
} from '$lib/server/transcription/transcription-model';
import { alignTranscription } from '$lib/server/transcription/forced-alignment';
import { detectSpeechChunks } from '$lib/server/transcription/voice-activity-detection';
import { diarizeAudio } from '$lib/server/transcription/speaker-diarization';
import { filterHallucinatedTranscription } from '$lib/server/transcription/hallucination-gate';
import type { SpeakerTurn } from '$lib/server/transcription/speaker-turn';
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
	const speakerLabels = new Map<number, number>();
	let content = '';

	for (const segment of segments) {
		const spoken = flattenSegmentText(segment.text);
		if (!spoken) continue;

		if (content) content += ' ';
		if (segment.speakerId !== undefined) {
			if (!speakerLabels.has(segment.speakerId)) {
				speakerLabels.set(segment.speakerId, speakerLabels.size + 1);
			}
			if (segment.speakerId !== previousSpeaker) {
				content += `Speaker ${speakerLabels.get(segment.speakerId)}: `;
			}
			previousSpeaker = segment.speakerId;
		}
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
		const overlapBySpeaker = new Map<number, number>();

		for (const turn of turns) {
			const overlapMs =
				Math.min(word.endMs, turn.end * 1000) - Math.max(word.startMs, turn.start * 1000);

			if (overlapMs <= 0) continue;

			overlapBySpeaker.set(turn.speaker, (overlapBySpeaker.get(turn.speaker) ?? 0) + overlapMs);
		}

		let speakerId: number | undefined;
		let greatestOverlapMs = 0;

		for (const [speaker, overlapMs] of overlapBySpeaker) {
			if (overlapMs <= greatestOverlapMs) continue;

			speakerId = speaker;
			greatestOverlapMs = overlapMs;
		}

		if (speakerId === undefined) return word;

		return {
			...word,
			speakerId
		};
	});
}

export async function extractTranscript(
	source: Source,
	onProgress?: (ratio: number, message: string) => void
): Promise<ExtractionResult> {
	const audioData = await decodeAudioFile(source.path);

	onProgress?.(0.12, 'Detecting speech');
	const audioChunks = await detectSpeechChunks(audioData);

	if (audioChunks.length === 0) {
		return buildTranscriptExtraction(source, [], '');
	}

	onProgress?.(0.25, 'Transcribing speech');
	let transcription = await transcribeAudioChunks(audioChunks);
	transcription = filterHallucinatedTranscription(transcription);

	if (transcription.segments.length > 0) {
		onProgress?.(0.58, 'Aligning transcript');
		transcription = await alignTranscription(transcription);
	}

	let segments = transcription.segments;

	if (segments.length > 0) {
		onProgress?.(0.72, 'Identifying speakers');

		try {
			/*
			 * Keep diarization on the complete original waveform.
			 * Running it independently on VAD chunks would destroy
			 * global speaker identity.
			 */
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
