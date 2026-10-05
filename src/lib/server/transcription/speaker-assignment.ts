import type { SpeakerTurn } from './speaker-turn';
import type { TranscriptSegment } from './transcription-model';

const NEAREST_TURN_MAX_GAP_MS = 500;

function nearestTurnSpeaker(word: TranscriptSegment, turns: SpeakerTurn[]): number | undefined {
	if (!/[\p{Letter}\p{Number}]/u.test(word.text)) return undefined;

	let speakerId: number | undefined;
	let smallestGapMs = NEAREST_TURN_MAX_GAP_MS;

	for (const turn of turns) {
		const gapMs = Math.max(turn.start * 1000 - word.endMs, word.startMs - turn.end * 1000, 0);
		if (gapMs > smallestGapMs) continue;
		if (speakerId !== undefined && gapMs === smallestGapMs) continue;

		speakerId = turn.speaker;
		smallestGapMs = gapMs;
	}

	return speakerId;
}

export function assignSpeakers(
	words: TranscriptSegment[],
	turns: SpeakerTurn[]
): TranscriptSegment[] {
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

		speakerId ??= nearestTurnSpeaker(word, turns);
		if (speakerId === undefined) return word;

		return {
			...word,
			speakerId
		};
	});
}
