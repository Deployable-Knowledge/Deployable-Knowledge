import { decodeAudioFile } from '#lib/server/transcription/audio-decoder';
import { labelSpeakers } from '#lib/server/transcription/speaker-diarization';
import {
	transcribeAudio,
	type TranscriptSegment
} from '#lib/server/transcription/transcription-model';
import { splitSentenceWindows } from './chunker';
import {
	buildChunkId,
	type ExtractedChunk,
	type ExtractionResult,
	type ParsedChunk,
	type Source,
	type TranscriptTimelineEntry
} from './parse-shared';

type SpeakerTurn = {
	speaker?: number;
	content: string;
	timeline: TranscriptTimelineEntry[];
};

function flattenSegmentText(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

function groupSpeakerTurns(segments: TranscriptSegment[]): SpeakerTurn[] {
	const turns: SpeakerTurn[] = [];

	for (const segment of segments) {
		const spoken = flattenSegmentText(segment.text);
		if (!spoken) continue;

		let turn = turns.at(-1);
		if (!turn || turn.speaker !== segment.speaker) {
			turn = { speaker: segment.speaker, content: '', timeline: [] };
			turns.push(turn);
		}

		if (turn.content) turn.content += ' ';
		const charStart = turn.content.length;
		turn.content += spoken;
		turn.timeline.push({
			charStart,
			charEnd: turn.content.length,
			startMs: segment.startMs,
			endMs: segment.endMs
		});
	}

	return turns;
}

export function buildTranscriptExtraction(
	source: Source,
	segments: TranscriptSegment[],
	fallbackText = ''
): ExtractionResult {
	const turns = groupSpeakerTurns(segments);

	// Timestamp-less model output still transcribes; it just cannot be followed along during playback
	if (turns.length === 0) {
		const content = flattenSegmentText(fallbackText);
		if (content) turns.push({ content, timeline: [] });
	}

	// Silent audio transcribes to nothing; ingestion reports the empty result to the user
	if (turns.length === 0) return { chunks: [], pageCount: 0 };

	return {
		chunks: turns.map(({ speaker, content, timeline }) => ({
			chunkType: 'TEXT',
			source,
			pageIndex: 0,
			content,
			timeline,
			speaker
		})),
		pageCount: 1
	};
}

export async function extractTranscript(
	source: Source,
	onProgress?: (ratio: number, message: string) => void
): Promise<ExtractionResult> {
	const audioData = await decodeAudioFile(source.path);

	onProgress?.(0.25, 'Transcribing speech');
	const transcription = await transcribeAudio(audioData);

	onProgress?.(0.75, 'Identifying speakers');
	const segments = await labelSpeakers(audioData, transcription.segments);

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

function chunkSpeakerTurn(turn: ExtractedChunk, firstChunkIndex: number): ParsedChunk[] {
	const timeline = turn.timeline ?? [];

	return splitSentenceWindows(turn.content).map(({ text, start, end }, offset) => {
		const chunkIndex = firstChunkIndex + offset;
		const startMs = timeline.length > 0 ? timeAtChar(timeline, start) : null;

		return {
			chunkId: buildChunkId(turn, chunkIndex, text),
			chunkType: turn.chunkType,
			source: turn.source,
			pageIndex: turn.pageIndex,
			chunkIndex,
			content: text,
			startMs,
			endMs: startMs === null ? null : Math.max(startMs, timeAtChar(timeline, end)),
			speaker: turn.speaker ?? null
		};
	});
}

export function chunkTranscript({ chunks: turns }: ExtractionResult): ParsedChunk[] {
	const chunks: ParsedChunk[] = [];
	for (const turn of turns) chunks.push(...chunkSpeakerTurn(turn, chunks.length));
	return chunks;
}
