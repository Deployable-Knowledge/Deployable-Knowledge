import type { SpeakerTurn } from './speaker-turn';
import type { TranscriptSegment } from './transcription-model';

const NEAREST_TURN_MAX_GAP_MS = 500;

const overlapBySpeaker = new Map<number, number>();

function overlappingSpeaker(word: TranscriptSegment, turns: SpeakerTurn[]): number | undefined {
	overlapBySpeaker.clear();

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

	return speakerId;
}

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

// Words are visited in start order while a window holds every turn within the nearest-turn gap,
// kept in turn order so overlap and nearest-turn ties resolve as in a full scan.
export function assignSpeakers(
	words: TranscriptSegment[],
	turns: SpeakerTurn[]
): TranscriptSegment[] {
	const orderedTurns = turns.toSorted((left, right) => left.start - right.start);
	const wordOrder = words
		.map((_, index) => index)
		.sort((left, right) => words[left].startMs - words[right].startMs);

	const assigned = words.slice();
	const window: SpeakerTurn[] = [];
	let nextTurn = 0;

	for (const index of wordOrder) {
		const word = words[index];

		while (
			nextTurn < orderedTurns.length &&
			orderedTurns[nextTurn].start * 1000 - word.endMs <= NEAREST_TURN_MAX_GAP_MS
		) {
			window.push(orderedTurns[nextTurn++]);
		}

		let kept = 0;
		for (const turn of window) {
			if (word.startMs - turn.end * 1000 <= NEAREST_TURN_MAX_GAP_MS) window[kept++] = turn;
		}
		window.length = kept;

		const speakerId = overlappingSpeaker(word, window) ?? nearestTurnSpeaker(word, window);
		if (speakerId !== undefined) assigned[index] = { ...word, speakerId };
	}

	return assigned;
}
