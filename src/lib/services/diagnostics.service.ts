import { API_DIAGNOSTICS } from '#lib/constants';
import type { ApiDiagnosticsSnapshot, ApiLogsResponse } from '#lib/types';
import { apiDownload, apiFetch } from '#lib/utils';

export class DiagnosticsService {
	static getSnapshot() {
		return apiFetch<ApiDiagnosticsSnapshot>(API_DIAGNOSTICS.BASE);
	}

	static getLogs(afterId: number) {
		const query = new URLSearchParams({ after: String(afterId) });
		return apiFetch<ApiLogsResponse>(`${API_DIAGNOSTICS.LOGS}?${query}`);
	}

	static downloadReport() {
		return apiDownload(API_DIAGNOSTICS.REPORT, 'deployable-knowledge-diagnostics.txt');
	}
}
