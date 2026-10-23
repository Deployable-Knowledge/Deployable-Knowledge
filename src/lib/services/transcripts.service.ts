import { API_TRANSCRIPTS } from '$lib/constants';
import { apiDownload } from '$lib/utils';

export class TranscriptsService {
	static download(id: string) {
		return apiDownload(API_TRANSCRIPTS.download(id), 'transcript.txt');
	}
}
