import type { ApiTranscriptResponse, TranscriptChunkRow } from '$lib/types';

function formatMilliseconds(milliseconds: number | null): string {
	if (milliseconds === null) return 'Unavailable';

	const bounded = Math.max(0, Math.round(milliseconds));
	const hours = Math.floor(bounded / 3_600_000);
	const minutes = Math.floor((bounded % 3_600_000) / 60_000);
	const seconds = Math.floor((bounded % 60_000) / 1000);
	const remainder = bounded % 1000;

	return (
		[
			String(hours).padStart(2, '0'),
			String(minutes).padStart(2, '0'),
			String(seconds).padStart(2, '0')
		].join(':') + `.${String(remainder).padStart(3, '0')}`
	);
}

function speakerTagLines(content: string): string[] {
	const matches = [...content.matchAll(/\bSpeaker \d+:/g)];

	if (matches.length === 0) {
		return ['Speaker tags: none'];
	}

	return [
		'Speaker tags:',
		...matches.map((match) => {
			const label = match[0].slice(0, -1);
			return `- ${label} at character ${match.index ?? 0}`;
		})
	];
}

function formatChunk(chunk: TranscriptChunkRow): string {
	const duration =
		chunk.startMs === null || chunk.endMs === null
			? null
			: Math.max(0, chunk.endMs - chunk.startMs);

	return [
		`Chunk ${chunk.chunkIndex + 1}`,
		`Time: ${formatMilliseconds(chunk.startMs)} – ${formatMilliseconds(chunk.endMs)}`,
		`Duration: ${formatMilliseconds(duration)}`,
		...speakerTagLines(chunk.content),
		'',
		'Transcript:',
		chunk.content.trim()
	].join('\n');
}

export function formatTranscriptExport(transcript: ApiTranscriptResponse): string {
	const lastEndMs = transcript.chunks.reduce<number | null>((latest, chunk) => {
		if (chunk.endMs === null) return latest;
		return latest === null ? chunk.endMs : Math.max(latest, chunk.endMs);
	}, null);

	const header = [
		`Title: ${transcript.document.title}`,
		`Source type: ${transcript.document.sourceType}`,
		`Chunks: ${transcript.chunks.length}`,
		`Transcript end: ${formatMilliseconds(lastEndMs)}`,
		`Updated: ${transcript.document.updatedAt}`,
		'Speaker tag character positions are zero based within each chunk.'
	];

	const body = transcript.chunks.map(formatChunk);

	return [...header, '', ...body.flatMap((chunk) => [chunk, ''])].join('\n').trimEnd() + '\n';
}

export function transcriptExportFilename(title: string): string {
	const base = title
		.replace(/[<>:"/\\|?*\p{Cc}]/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\.+$/, '');

	return `${base || 'transcript'}.txt`;
}
