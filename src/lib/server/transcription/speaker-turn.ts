/** A region of the source audio attributed to one diarized speaker, in seconds. */
export interface SpeakerTurn {
	start: number;
	end: number;
	speaker: number;
}
