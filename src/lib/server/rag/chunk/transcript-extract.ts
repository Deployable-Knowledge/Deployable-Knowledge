import { decodeAudioFile } from '$lib/server/transcription/audio-decoder';
import type { TranscriptSegment } from '$lib/server/transcription/transcription-model';
import { transcribeRecording } from '$lib/server/transcription/transcription-worker';
import type { TranscriptionStage } from '$lib/server/transcription/transcription-worker-protocol';
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

const TRANSCRIPTION_PROGRESS: Record<
	TranscriptionStage,
	{ start: number; share: number; message: string }
> = {
	speech: { start: 0.12, share: 0.13, message: 'Detecting speech' },
	transcription: { start: 0.25, share: 0.33, message: 'Transcribing speech' },
	alignment: { start: 0.58, share: 0.14, message: 'Aligning transcript' },
	segmentation: {
		start: 0.72,
		share: 0.026,
		message: 'Identifying speakers: finding who speaks when'
	},
	embeddings: { start: 0.746, share: 0.195, message: 'Identifying speakers: recognizing voices' },
	clustering: { start: 0.941, share: 0.026, message: 'Identifying speakers: grouping voices' },
	reconstruction: {
		start: 0.967,
		share: 0.013,
		message: 'Identifying speakers: building speaker turns'
	}
};

export async function extractTranscript(
	source: Source,
	onProgress?: (ratio: number, message: string) => void
): Promise<ExtractionResult> {
	const audioData = await decodeAudioFile(source.path);

	const { text, segments, speakerError } = await transcribeRecording(
		audioData,
		(stage, fraction) => {
			const { start, share, message } = TRANSCRIPTION_PROGRESS[stage];
			onProgress?.(start + share * fraction, message);
		}
	);

	if (speakerError) {
		console.warn('[Transcription] Speaker diarization unavailable:', speakerError);
	}

	return buildTranscriptExtraction(source, segments, text);
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
