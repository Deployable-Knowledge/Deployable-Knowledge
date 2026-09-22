import { error } from '@sveltejs/kit';
import { DocumentsRepository } from '$lib/server/repositories';
import {
	formatTranscriptExport,
	transcriptExportFilename
} from '$lib/server/transcription/transcript-export';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const transcript = await DocumentsRepository.transcript(params.id);

	if (!transcript) throw error(404, 'Document not found.');

	const { sourceType } = transcript.document;
	if (sourceType !== 'AUDIO' && sourceType !== 'YOUTUBE') {
		throw error(400, 'This document is not a transcript.');
	}

	const filename = transcriptExportFilename(transcript.document.title);

	return new Response(formatTranscriptExport(transcript), {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Disposition': `attachment; filename="transcript.txt"; filename*=UTF-8''${encodeURIComponent(filename)}`,
			'Content-Type': 'text/plain; charset=utf-8',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
